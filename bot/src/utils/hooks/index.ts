// Core hook system exports
export * from "./HookTypes";
export * from "./BaseHook";
export * from "./HookManager";

// Default hooks
export * from "./defaults/ServerSelectionHook";
export * from "./defaults/CategorySelectionHook";

// Re-export singleton instance for convenience
export { hookManager } from "./HookManager";
