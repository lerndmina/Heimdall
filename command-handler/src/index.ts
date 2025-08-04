// Main exports for the command handler package
export { CommandHandler } from "./CommandHandler";

// Export all types for external use
export * from "./types";

// Export loaders for advanced usage
export { CommandLoader } from "./loaders/CommandLoader";
export { EventLoader } from "./loaders/EventLoader";
export { ValidationLoader } from "./loaders/ValidationLoader";

// Export utilities
export * from "./utils/fileUtils";
export * from "./utils/pathUtils";
export * from "./utils/validation";

// Export ButtonKit and reactive utilities
export { ButtonKit, createSignal, createEffect } from "./ButtonKit";

// Phase 2: Export management features
export { CommandManager } from "./services/CommandManager";
export { ManagementCommands } from "./builtin/ManagementCommands";
export { HelpCommand } from "./builtin/HelpCommand";
export { HotReloadSystem } from "./services/HotReloadSystem";
export { PermissionManager } from "./services/PermissionManager";
