import type { Middleware, MiddlewareContext, MiddlewareConfig, MiddlewareResult, MiddlewareMetrics, MiddlewareExecutionContext } from "../types/Middleware";
import { createLogger, LogLevel } from "@heimdall/logger";

export class MiddlewareManager {
  private logger = createLogger("command-handler-middleware", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private preMiddleware: Middleware[] = [];
  private postMiddleware: Middleware[] = [];
  private commandSpecificMiddleware = new Map<string, Middleware[]>();
  private config: MiddlewareConfig;
  private metrics = new Map<string, MiddlewareMetrics>();

  constructor(config: Partial<MiddlewareConfig> = {}) {
    this.config = {
      enableBuiltinMiddleware: true,
      enableGlobalMiddleware: true,
      enableCommandSpecificMiddleware: true,
      maxExecutionTime: 5000, // 5 seconds
      enableMetrics: true,
      ...config,
    };

    this.logger.debug("MiddlewareManager initialized with config:", this.config);
  }

  /**
   * Register a middleware
   */
  register(middleware: Middleware): void {
    if (!middleware.enabled) {
      this.logger.debug(`Middleware ${middleware.name} is disabled, skipping registration`);
      return;
    }

    if (middleware.type === "pre") {
      this.preMiddleware.push(middleware);
      this.preMiddleware.sort((a, b) => a.priority - b.priority);
    } else {
      this.postMiddleware.push(middleware);
      this.postMiddleware.sort((a, b) => a.priority - b.priority);
    }

    // Initialize metrics
    if (this.config.enableMetrics) {
      this.metrics.set(middleware.name, {
        name: middleware.name,
        executionCount: 0,
        averageExecutionTime: 0,
        errorCount: 0,
        totalExecutionTime: 0,
      });
    }

    this.logger.debug(`Registered ${middleware.type}-middleware: ${middleware.name} (priority: ${middleware.priority})`);
  }

  /**
   * Register command-specific middleware
   */
  registerForCommand(commandName: string, middleware: Middleware): void {
    if (!this.config.enableCommandSpecificMiddleware) {
      this.logger.debug("Command-specific middleware is disabled");
      return;
    }

    if (!middleware.enabled) {
      this.logger.debug(`Middleware ${middleware.name} is disabled, skipping command registration`);
      return;
    }

    if (!this.commandSpecificMiddleware.has(commandName)) {
      this.commandSpecificMiddleware.set(commandName, []);
    }

    const commandMiddleware = this.commandSpecificMiddleware.get(commandName)!;
    commandMiddleware.push(middleware);

    // Sort by priority
    if (middleware.type === "pre") {
      commandMiddleware.sort((a, b) => a.priority - b.priority);
    }

    this.logger.debug(`Registered command-specific middleware for ${commandName}: ${middleware.name}`);
  }

  /**
   * Unregister a middleware by name
   */
  unregister(middlewareName: string): boolean {
    let removed = false;

    // Remove from pre-middleware
    const preIndex = this.preMiddleware.findIndex((m) => m.name === middlewareName);
    if (preIndex !== -1) {
      this.preMiddleware.splice(preIndex, 1);
      removed = true;
    }

    // Remove from post-middleware
    const postIndex = this.postMiddleware.findIndex((m) => m.name === middlewareName);
    if (postIndex !== -1) {
      this.postMiddleware.splice(postIndex, 1);
      removed = true;
    }

    // Remove from command-specific middleware
    for (const [commandName, middleware] of this.commandSpecificMiddleware) {
      const commandIndex = middleware.findIndex((m) => m.name === middlewareName);
      if (commandIndex !== -1) {
        middleware.splice(commandIndex, 1);
        removed = true;
      }
    }

    // Remove metrics
    if (this.config.enableMetrics) {
      this.metrics.delete(middlewareName);
    }

    if (removed) {
      this.logger.debug(`Unregistered middleware: ${middlewareName}`);
    }

    return removed;
  }

  /**
   * Execute pre-middleware pipeline
   */
  async executePreMiddleware(context: MiddlewareContext): Promise<boolean> {
    if (!this.config.enableGlobalMiddleware) {
      return true;
    }

    const middlewareToExecute = [...this.preMiddleware];

    // Add command-specific pre-middleware if enabled
    if (this.config.enableCommandSpecificMiddleware) {
      const commandMiddleware = this.commandSpecificMiddleware.get(context.command.name) || [];
      const commandPreMiddleware = commandMiddleware.filter((m) => m.type === "pre");
      middlewareToExecute.push(...commandPreMiddleware);
      // Re-sort by priority
      middlewareToExecute.sort((a, b) => a.priority - b.priority);
    }

    return this.executeMiddlewareChain(middlewareToExecute, context, "pre");
  }

  /**
   * Execute post-middleware pipeline
   */
  async executePostMiddleware(context: MiddlewareContext): Promise<void> {
    if (!this.config.enableGlobalMiddleware) {
      return;
    }

    const middlewareToExecute = [...this.postMiddleware];

    // Add command-specific post-middleware if enabled
    if (this.config.enableCommandSpecificMiddleware) {
      const commandMiddleware = this.commandSpecificMiddleware.get(context.command.name) || [];
      const commandPostMiddleware = commandMiddleware.filter((m) => m.type === "post");
      middlewareToExecute.push(...commandPostMiddleware);
      // Re-sort by priority
      middlewareToExecute.sort((a, b) => a.priority - b.priority);
    }

    await this.executeMiddlewareChain(middlewareToExecute, context, "post");
  }

  /**
   * Execute a chain of middleware
   */
  private async executeMiddlewareChain(middleware: Middleware[], context: MiddlewareContext, type: "pre" | "post"): Promise<boolean> {
    let index = 0;
    let shouldContinue = true;

    const next = async (): Promise<void> => {
      if (index >= middleware.length) {
        return;
      }

      const currentMiddleware = middleware[index++];
      const executionContext: MiddlewareExecutionContext = {
        middlewareName: currentMiddleware.name,
        startTime: Date.now(),
        success: false,
      };

      try {
        // Set timeout for middleware execution
        const timeoutPromise = new Promise<MiddlewareResult>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Middleware ${currentMiddleware.name} timed out after ${this.config.maxExecutionTime}ms`));
          }, this.config.maxExecutionTime);
        });

        const executionPromise = currentMiddleware.execute(context, next);
        const result = await Promise.race([executionPromise, timeoutPromise]);

        executionContext.endTime = Date.now();
        executionContext.executionTime = executionContext.endTime - executionContext.startTime;
        executionContext.success = result.success;

        // Update metrics
        if (this.config.enableMetrics) {
          this.updateMetrics(currentMiddleware.name, executionContext);
        }

        // Handle result
        if (!result.success) {
          this.logger.warn(`Middleware ${currentMiddleware.name} failed:`, result.error);
          if (type === "pre") {
            shouldContinue = false;
            return;
          }
        }

        if (!result.shouldContinue && type === "pre") {
          shouldContinue = false;
          return;
        }

        // Merge metadata
        if (result.metadata) {
          for (const [key, value] of Object.entries(result.metadata)) {
            context.metadata.set(key, value);
          }
        }
      } catch (error) {
        executionContext.endTime = Date.now();
        executionContext.executionTime = executionContext.endTime - executionContext.startTime;
        executionContext.success = false;
        executionContext.error = error as Error;

        this.logger.error(`Middleware ${currentMiddleware.name} threw an error:`, error);

        // Update metrics
        if (this.config.enableMetrics) {
          this.updateMetrics(currentMiddleware.name, executionContext);
        }

        // For pre-middleware, stop execution on error
        if (type === "pre") {
          shouldContinue = false;
          return;
        }
      }
    };

    await next();
    return shouldContinue;
  }

  /**
   * Update middleware metrics
   */
  private updateMetrics(middlewareName: string, executionContext: MiddlewareExecutionContext): void {
    const metrics = this.metrics.get(middlewareName);
    if (!metrics || !executionContext.executionTime) {
      return;
    }

    metrics.executionCount++;
    metrics.totalExecutionTime += executionContext.executionTime;
    metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.executionCount;
    metrics.lastExecuted = new Date();

    if (!executionContext.success) {
      metrics.errorCount++;
    }
  }

  /**
   * Get middleware by name
   */
  getMiddleware(name: string): Middleware | undefined {
    return [...this.preMiddleware, ...this.postMiddleware].find((m) => m.name === name);
  }

  /**
   * List all registered middleware
   */
  listMiddleware(): { pre: Middleware[]; post: Middleware[]; commandSpecific: Map<string, Middleware[]> } {
    return {
      pre: [...this.preMiddleware],
      post: [...this.postMiddleware],
      commandSpecific: new Map(this.commandSpecificMiddleware),
    };
  }

  /**
   * Get middleware metrics
   */
  getMetrics(middlewareName?: string): MiddlewareMetrics[] | MiddlewareMetrics | undefined {
    if (middlewareName) {
      return this.metrics.get(middlewareName);
    }
    return Array.from(this.metrics.values());
  }

  /**
   * Enable or disable a middleware
   */
  setMiddlewareEnabled(middlewareName: string, enabled: boolean): boolean {
    const middleware = this.getMiddleware(middlewareName);
    if (middleware) {
      middleware.enabled = enabled;
      this.logger.debug(`${enabled ? "Enabled" : "Disabled"} middleware: ${middlewareName}`);
      return true;
    }
    return false;
  }

  /**
   * Clear all middleware
   */
  clear(): void {
    this.preMiddleware.length = 0;
    this.postMiddleware.length = 0;
    this.commandSpecificMiddleware.clear();
    this.metrics.clear();
    this.logger.debug("Cleared all middleware");
  }

  /**
   * Get middleware execution summary
   */
  getExecutionSummary(): {
    totalMiddleware: number;
    enabledMiddleware: number;
    averageExecutionTime: number;
    totalErrorCount: number;
  } {
    const allMiddleware = [...this.preMiddleware, ...this.postMiddleware];
    const allMetrics = Array.from(this.metrics.values());

    return {
      totalMiddleware: allMiddleware.length,
      enabledMiddleware: allMiddleware.filter((m) => m.enabled).length,
      averageExecutionTime: allMetrics.reduce((sum, m) => sum + m.averageExecutionTime, 0) / allMetrics.length || 0,
      totalErrorCount: allMetrics.reduce((sum, m) => sum + m.errorCount, 0),
    };
  }
}
