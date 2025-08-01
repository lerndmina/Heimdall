import { Client } from "discord.js";
import type { ErrorHandlerConfig } from "./Errors";
import type { MiddlewareConfig } from "./Middleware";
import type { PermissionConfig } from "./Permissions";
import type { ManagementConfig } from "./Management";
import type { HotReloadConfig } from "./HotReload";
import type { AnalyticsConfig } from "./Analytics";

// Handler configuration interface
export interface HandlerConfig {
  client: Client<true>;

  // Required paths (absolute)
  commandsPath: string;
  eventsPath: string;
  validationsPath: string;

  // Optional CommandKit compatibility
  devGuildIds?: string[];
  devUserIds?: string[];

  // Phase 1: Core Infrastructure Configuration
  errorHandling?: Partial<ErrorHandlerConfig>;
  middleware?: Partial<MiddlewareConfig>;
  permissions?: Partial<PermissionConfig>;

  // Phase 2: Management Features Configuration
  management?: Partial<ManagementConfig>;
  hotReload?: Partial<HotReloadConfig>;
  analytics?: Partial<AnalyticsConfig>;

  // Enhanced options
  options?: {
    autoRegisterCommands?: boolean; // Default: true
    handleValidationErrors?: boolean; // Default: true
    logLevel?: "debug" | "info" | "warn" | "error"; // Default: 'info'
    enableHotReload?: boolean; // Default: false (dev only)

    // Phase 1 options
    enableErrorHandling?: boolean; // Default: true
    enableMiddleware?: boolean; // Default: true
    enableAdvancedPermissions?: boolean; // Default: true

    // Phase 2 options
    enableManagementCommands?: boolean; // Default: false
    enableCommandManager?: boolean; // Default: true
    enableAnalytics?: boolean; // Default: false
  };
}
