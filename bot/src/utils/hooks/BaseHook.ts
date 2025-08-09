import { HookResult, HookContext, HookMetadata, HookPriority, HookType } from "./HookTypes";
import log from "../log";

/**
 * Abstract base class for all modmail hooks
 * Provides common functionality and enforces hook interface
 */
export abstract class BaseHook {
  protected metadata: HookMetadata;

  constructor(
    id: string,
    name: string,
    description: string,
    type: HookType,
    priority: HookPriority = HookPriority.NORMAL
  ) {
    this.metadata = {
      id,
      name,
      description,
      type,
      priority,
      enabled: true,
    };
  }

  /**
   * Get hook metadata
   */
  public getMetadata(): HookMetadata {
    return { ...this.metadata };
  }

  /**
   * Check if hook is enabled
   */
  public isEnabled(): boolean {
    return this.metadata.enabled;
  }

  /**
   * Enable or disable the hook
   */
  public setEnabled(enabled: boolean): void {
    this.metadata.enabled = enabled;
    log.debug(`Hook ${this.metadata.id} ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Add a condition that must be met for this hook to execute
   */
  public addCondition(condition: (context: HookContext) => boolean): void {
    if (!this.metadata.conditions) {
      this.metadata.conditions = [];
    }
    this.metadata.conditions.push(condition);
  }

  /**
   * Check if all conditions are met for hook execution
   */
  protected checkConditions(context: HookContext): boolean {
    if (!this.metadata.conditions || this.metadata.conditions.length === 0) {
      return true;
    }

    return this.metadata.conditions.every((condition) => {
      try {
        return condition(context);
      } catch (error) {
        log.error(`Error checking condition for hook ${this.metadata.id}:`, error);
        return false;
      }
    });
  }

  /**
   * Validate that the context is compatible with this hook type
   */
  protected validateContext(context: HookContext): boolean {
    return context.hookType === this.metadata.type;
  }

  /**
   * Execute the hook with the given context
   * This method handles validation and condition checking
   */
  public async execute(context: HookContext): Promise<HookResult> {
    try {
      // Check if hook is enabled
      if (!this.isEnabled()) {
        log.debug(`Hook ${this.metadata.id} is disabled, skipping`);
        return {
          success: true,
          continue: true,
        };
      }

      // Validate context type
      if (!this.validateContext(context)) {
        log.warn(`Hook ${this.metadata.id} received invalid context type`);
        return {
          success: false,
          continue: true,
          error: `Invalid context type for hook ${this.metadata.id}`,
        };
      }

      // Check conditions
      if (!this.checkConditions(context)) {
        log.debug(`Hook ${this.metadata.id} conditions not met, skipping`);
        return {
          success: true,
          continue: true,
        };
      }

      log.debug(`Executing hook: ${this.metadata.id}`);

      // Execute the actual hook logic
      const result = await this.executeHook(context);

      log.debug(`Hook ${this.metadata.id} completed:`, {
        success: result.success,
        continue: result.continue,
        hasData: !!result.data,
        hasError: !!result.error,
      });

      return result;
    } catch (error) {
      log.error(`Unhandled error in hook ${this.metadata.id}:`, error);
      return {
        success: false,
        continue: true,
        error: error instanceof Error ? error.message : "Unknown hook error",
        userMessage: "An unexpected error occurred while processing your request.",
      };
    }
  }

  /**
   * Abstract method that must be implemented by concrete hook classes
   * This contains the actual hook logic
   */
  protected abstract executeHook(context: HookContext): Promise<HookResult>;

  /**
   * Helper method to create a success result
   */
  protected createSuccessResult(data?: Record<string, any>, continueExecution = true): HookResult {
    return {
      success: true,
      continue: continueExecution,
      data,
    };
  }

  /**
   * Helper method to create an error result
   */
  protected createErrorResult(
    error: string,
    userMessage?: string,
    continueExecution = true
  ): HookResult {
    return {
      success: false,
      continue: continueExecution,
      error,
      userMessage,
    };
  }

  /**
   * Helper method to create a stop result (prevents further hook execution)
   */
  protected createStopResult(data?: Record<string, any>, error?: string): HookResult {
    return {
      success: !error,
      continue: false,
      data,
      error,
    };
  }
}
