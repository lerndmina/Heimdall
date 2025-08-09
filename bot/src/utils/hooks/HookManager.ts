import {
  HookType,
  HookContext,
  HookResult,
  HookRegistration,
  HookPriority,
  BeforeCreationHookContext,
  BeforeClosingHookContext,
} from "./HookTypes";
import { BaseHook } from "./BaseHook";
import log from "../log";

/**
 * Central manager for the modmail hook system
 * Handles registration, execution, and coordination of hooks
 */
export class HookManager {
  private hooks: Map<HookType, HookRegistration[]> = new Map();
  private static instance: HookManager | null = null;

  constructor() {
    // Initialize hook type arrays
    for (const hookType of Object.values(HookType)) {
      this.hooks.set(hookType, []);
    }
  }

  /**
   * Get singleton instance of HookManager
   */
  public static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Register a hook using a BaseHook instance
   */
  public registerHook(hook: BaseHook): void {
    const metadata = hook.getMetadata();
    const registration: HookRegistration = {
      ...metadata,
      execute: (context: HookContext) => hook.execute(context),
    };

    this.registerHookRegistration(registration);
  }

  /**
   * Register a hook using a HookRegistration object
   */
  public registerHookRegistration(registration: HookRegistration): void {
    const hooks = this.hooks.get(registration.type);
    if (!hooks) {
      throw new Error(`Unknown hook type: ${registration.type}`);
    }

    // Check for duplicate IDs
    if (hooks.some((h) => h.id === registration.id)) {
      throw new Error(`Hook with ID ${registration.id} is already registered`);
    }

    hooks.push(registration);

    // Sort hooks by priority (highest first)
    hooks.sort((a, b) => b.priority - a.priority);

    log.info(
      `Registered hook: ${registration.id} (${registration.type}, priority: ${registration.priority})`
    );
  }

  /**
   * Unregister a hook by ID
   */
  public unregisterHook(hookId: string, type?: HookType): boolean {
    if (type) {
      const hooks = this.hooks.get(type);
      if (hooks) {
        const index = hooks.findIndex((h) => h.id === hookId);
        if (index !== -1) {
          hooks.splice(index, 1);
          log.info(`Unregistered hook: ${hookId} from ${type}`);
          return true;
        }
      }
    } else {
      // Search all hook types
      for (const [hookType, hooks] of this.hooks.entries()) {
        const index = hooks.findIndex((h) => h.id === hookId);
        if (index !== -1) {
          hooks.splice(index, 1);
          log.info(`Unregistered hook: ${hookId} from ${hookType}`);
          return true;
        }
      }
    }

    log.warn(`Hook not found for unregistration: ${hookId}`);
    return false;
  }

  /**
   * Get all registered hooks for a specific type
   */
  public getHooks(type: HookType): HookRegistration[] {
    return [...(this.hooks.get(type) || [])];
  }

  /**
   * Get all registered hooks across all types
   */
  public getAllHooks(): Map<HookType, HookRegistration[]> {
    const result = new Map<HookType, HookRegistration[]>();
    for (const [type, hooks] of this.hooks.entries()) {
      result.set(type, [...hooks]);
    }
    return result;
  }

  /**
   * Enable or disable a specific hook
   */
  public setHookEnabled(hookId: string, enabled: boolean, type?: HookType): boolean {
    const targetHooks = type ? [this.hooks.get(type)] : Array.from(this.hooks.values());

    for (const hooks of targetHooks) {
      if (hooks) {
        const hook = hooks.find((h) => h.id === hookId);
        if (hook) {
          hook.enabled = enabled;
          log.info(`Hook ${hookId} ${enabled ? "enabled" : "disabled"}`);
          return true;
        }
      }
    }

    log.warn(`Hook not found for enable/disable: ${hookId}`);
    return false;
  }

  /**
   * Execute all hooks of a specific type with the given context
   */
  public async executeHooks(type: HookType, context: HookContext): Promise<HookExecutionResult> {
    const hooks = this.hooks.get(type);
    if (!hooks || hooks.length === 0) {
      log.debug(`No hooks registered for type: ${type}`);
      return {
        success: true,
        executedHooks: 0,
        results: [],
        aggregatedData: {},
      };
    }

    log.debug(`Executing ${hooks.length} hooks for type: ${type}`);

    const results: Array<{ hookId: string; result: HookResult }> = [];
    const aggregatedData: Record<string, any> = {};
    let executedHooks = 0;

    // Create a mutable context that can be updated between hook executions
    const mutableContext = { ...context };

    // Create shared bot message if we're dealing with beforeCreation hooks and there are hooks to execute
    if (type === HookType.BEFORE_CREATION && hooks.some((h) => h.enabled)) {
      try {
        const sharedBotMessage = await context.user.send({
          content: "Setting up your modmail request...",
        });
        mutableContext.sharedBotMessage = sharedBotMessage;
        log.debug(`Created shared bot message: ${sharedBotMessage.id}`);
      } catch (error) {
        log.error("Failed to create shared bot message:", error);
        return {
          success: false,
          executedHooks: 0,
          results: [],
          aggregatedData: {},
          error: "Failed to create shared message",
          userMessage: "Unable to start modmail process. Please try again.",
        };
      }
    }

    for (const hook of hooks) {
      if (!hook.enabled) {
        log.debug(`Skipping disabled hook: ${hook.id}`);
        continue;
      }

      try {
        executedHooks++;
        log.debug(`Executing hook: ${hook.id}`);

        const result = await hook.execute(mutableContext);
        results.push({ hookId: hook.id, result });

        // Aggregate data from successful hooks
        if (result.success && result.data) {
          Object.assign(aggregatedData, result.data);

          // Update the context with aggregated data for next hooks
          Object.assign(mutableContext, result.data);
        }

        // If hook failed or requested to stop execution
        if (!result.success || !result.continue) {
          log.debug(`Hook execution ${result.success ? "stopped" : "failed"} at: ${hook.id}`);

          return {
            success: result.success,
            executedHooks,
            results,
            aggregatedData,
            stoppedAt: hook.id,
            error: result.error,
            userMessage: result.userMessage,
          };
        }
      } catch (error) {
        log.error(`Hook ${hook.id} threw an exception:`, error);

        const errorResult: HookResult = {
          success: false,
          continue: true,
          error: error instanceof Error ? error.message : "Unknown error",
          userMessage: "An unexpected error occurred while processing your request.",
        };

        results.push({ hookId: hook.id, result: errorResult });

        // Continue execution unless it's a critical error
        // This could be made configurable per hook
      }
    }

    log.debug(`Completed execution of ${executedHooks} hooks for type: ${type}`);

    return {
      success: true,
      executedHooks,
      results,
      aggregatedData,
    };
  }

  /**
   * Clear all registered hooks (useful for testing)
   */
  public clearAllHooks(): void {
    for (const hooks of this.hooks.values()) {
      hooks.length = 0;
    }
    log.info("Cleared all registered hooks");
  }

  /**
   * Get statistics about registered hooks
   */
  public getStats(): HookManagerStats {
    const stats: HookManagerStats = {
      totalHooks: 0,
      hooksByType: {} as Record<HookType, { total: number; enabled: number; disabled: number }>,
      enabledHooks: 0,
      disabledHooks: 0,
    };

    for (const [type, hooks] of this.hooks.entries()) {
      stats.hooksByType[type] = {
        total: hooks.length,
        enabled: hooks.filter((h) => h.enabled).length,
        disabled: hooks.filter((h) => !h.enabled).length,
      };

      stats.totalHooks += hooks.length;
      stats.enabledHooks += stats.hooksByType[type].enabled;
      stats.disabledHooks += stats.hooksByType[type].disabled;
    }

    return stats;
  }
}

/**
 * Result of executing a set of hooks
 */
export interface HookExecutionResult {
  success: boolean;
  executedHooks: number;
  results: Array<{ hookId: string; result: HookResult }>;
  aggregatedData: Record<string, any>;
  stoppedAt?: string; // ID of hook that stopped execution
  error?: string;
  userMessage?: string;
}

/**
 * Statistics about the hook manager
 */
export interface HookManagerStats {
  totalHooks: number;
  hooksByType: Record<HookType, { total: number; enabled: number; disabled: number }>;
  enabledHooks: number;
  disabledHooks: number;
}

// Export singleton instance
export const hookManager = HookManager.getInstance();
