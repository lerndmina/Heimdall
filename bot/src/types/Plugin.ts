/**
 * Plugin System Types for Heimdall v1
 */

import type { HeimdallClient } from "./Client";
import type mongoose from "mongoose";
import type { RedisClientType } from "redis";
import type { ComponentCallbackService } from "../core/services/ComponentCallbackService";
import type { GuildEnvService } from "../core/services/GuildEnvService";
import type { CommandManager } from "../core/CommandManager";
import type { EventManager } from "../core/EventManager";
import type { ApiManager } from "../core/ApiManager";

/**
 * Plugin manifest (manifest.json)
 */
export interface PluginManifest {
  /** Unique plugin identifier */
  name: string;

  /** Semver version string */
  version: string;

  /** Human-readable description */
  description: string;

  /** Entry file relative to plugin root (default: "index.ts") */
  main?: string;

  /** Required plugins that must be loaded first */
  dependencies: string[];

  /** Optional plugins loaded first if present */
  optionalDependencies: string[];

  /** Environment variables that must exist */
  requiredEnv: string[];

  /** Environment variables that may exist */
  optionalEnv: string[];

  /** API route prefix (e.g., "/tickets") */
  apiRoutePrefix?: string;

  /** Skip loading this plugin */
  disabled?: boolean;
}

/**
 * Context passed to plugin onLoad function
 */
export interface PluginContext {
  /** Discord client with Heimdall extensions */
  client: HeimdallClient;

  /** Mongoose instance for database access */
  mongoose: typeof mongoose;

  /** Redis client for caching */
  redis: RedisClientType;

  /** Plugin's own manifest */
  manifest: PluginManifest;

  /** Absolute path to plugin directory */
  pluginPath: string;

  /** Logger instance scoped to plugin */
  logger: PluginLogger;

  /** APIs from dependency plugins */
  dependencies: Map<string, PluginAPI>;

  /** Environment variable access */
  getEnv: (key: string) => string | undefined;

  /** Check if env exists and is non-empty */
  hasEnv: (key: string) => boolean;

  // === Core Services ===

  /** Component callback service for button/menu handling */
  componentCallbackService: ComponentCallbackService;

  /** Guild environment service for encrypted guild-specific env vars */
  guildEnvService: GuildEnvService;

  /** Command manager for registering commands */
  commandManager: CommandManager;

  /** Event manager for registering events */
  eventManager: EventManager;

  /** API manager for registering API routes */
  apiManager: ApiManager;
}

/**
 * Logger interface for plugins
 */
export interface PluginLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * API surface exposed by a plugin to dependents
 */
export interface PluginAPI {
  [key: string]: unknown;
}

/**
 * Plugin entry module exports
 */
export interface PluginModule {
  /** Called when plugin loads - return API for dependents */
  onLoad: (context: PluginContext) => Promise<PluginAPI>;

  /** Called when plugin unloads (bot shutdown) */
  onDisable?: (logger: PluginLogger) => Promise<void>;

  /** Path to commands directory (relative to plugin) */
  commands?: string;

  /** Path to events directory (relative to plugin) */
  events?: string;

  /** Path to API routes directory (relative to plugin) */
  api?: string;
}

/**
 * Loaded plugin with resolved data
 */
export interface LoadedPlugin {
  /** Plugin manifest */
  manifest: PluginManifest;

  /** Absolute path to plugin directory */
  path: string;

  /** Plugin module exports */
  module: PluginModule;

  /** API returned from onLoad */
  api: PluginAPI;

  /** Logger instance for this plugin */
  logger: PluginLogger;

  /** Load status */
  status: "loaded" | "failed" | "disabled";

  /** Error if status is "failed" */
  error?: Error;
}

/**
 * Configuration override file (plugins.json)
 */
export interface PluginsConfig {
  /** Explicit list of plugins to load (in order) */
  plugins?: string[];

  /** Plugins to skip even if present */
  disabled?: string[];
}
