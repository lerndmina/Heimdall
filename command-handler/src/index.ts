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

// Phase 1: Export core infrastructure services
export { ErrorHandler } from "./utils/errorHandling";
export { MiddlewareManager } from "./middleware/MiddlewareManager";
export { PermissionManager } from "./services/PermissionManager";

// Phase 1: Export built-in middleware
export { LoggingMiddleware, PostLoggingMiddleware } from "./middleware/builtin/LoggingMiddleware";
export { RateLimitMiddleware } from "./middleware/builtin/RateLimitMiddleware";

// Phase 2: Export management features
export { CommandManager } from "./services/CommandManager";
export { ManagementCommands } from "./builtin/ManagementCommands";
export { HotReloadSystem } from "./services/HotReloadSystem";
export { AnalyticsCollector } from "./services/AnalyticsCollector";

// Phase 1: Export enums that may be used as values
export { ErrorCategory } from "./types/Errors";
export { PermissionType } from "./types/Permissions";
