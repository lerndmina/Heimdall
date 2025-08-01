import type { Middleware, MiddlewareContext, MiddlewareResult } from "../../types/Middleware";
import { createLogger, LogLevel } from "@heimdall/logger";

export class LoggingMiddleware implements Middleware {
  name = "logging";
  priority = 1000; // Low priority (executed late)
  type = "pre" as const;
  enabled = true;

  private logger = createLogger("command-handler-requests", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  async execute(context: MiddlewareContext, next: () => Promise<void>): Promise<MiddlewareResult> {
    const startTime = Date.now();

    // Log incoming request
    this.logger.info("Command execution started", {
      command: context.command.name,
      user: context.userId,
      guild: context.guildId,
      channel: context.channelId,
      timestamp: new Date().toISOString(),
    });

    try {
      await next();

      const executionTime = Date.now() - startTime;

      // Log successful completion
      this.logger.info("Command execution completed", {
        command: context.command.name,
        user: context.userId,
        executionTime: `${executionTime}ms`,
        success: true,
      });

      return {
        success: true,
        shouldContinue: true,
        metadata: {
          executionTime,
          loggedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log error
      this.logger.error("Command execution failed", {
        command: context.command.name,
        user: context.userId,
        executionTime: `${executionTime}ms`,
        error: error instanceof Error ? error.message : String(error),
        success: false,
      });

      return {
        success: false,
        shouldContinue: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

export class PostLoggingMiddleware implements Middleware {
  name = "post-logging";
  priority = 1000; // Low priority
  type = "post" as const;
  enabled = true;

  private logger = createLogger("command-handler-responses", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  async execute(context: MiddlewareContext, next: () => Promise<void>): Promise<MiddlewareResult> {
    try {
      await next();

      // Log post-execution details
      const totalTime = Date.now() - context.startTime;

      this.logger.debug("Post-execution logging", {
        command: context.command.name,
        totalExecutionTime: `${totalTime}ms`,
        metadataKeys: Array.from(context.metadata.keys()),
        completed: true,
      });

      return {
        success: true,
        shouldContinue: true,
        metadata: {
          postLoggedAt: new Date().toISOString(),
          totalExecutionTime: totalTime,
        },
      };
    } catch (error) {
      this.logger.error("Post-execution logging failed", {
        command: context.command.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        shouldContinue: true, // Don't stop other post-middleware
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
