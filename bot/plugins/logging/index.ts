/**
 * Logging Plugin — Per-guild event logging with categories, subcategory toggles,
 * and configurable channels for messages, users, and moderation events.
 *
 * Provides:
 * - /logging setup|disable|view|toggle commands
 * - Event handlers for message/user/moderation events
 * - Dashboard API routes for config CRUD
 */

import path from "path";
import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import model to register with Mongoose
import "./models/LoggingConfig.js";

// Import services
import { LoggingService } from "./services/LoggingService.js";
import { LoggingEventService } from "./services/LoggingEventService.js";

// Import API router factory
import { createLoggingRouter } from "./api/index.js";

/** Public API exposed to other plugins and event handlers */
export interface LoggingPluginAPI extends PluginAPI {
  version: string;
  loggingService: LoggingService;
  eventService: LoggingEventService;
  lib: LibAPI;
}

let loggingService: LoggingService;
let eventService: LoggingEventService;

export async function onLoad(context: PluginContext): Promise<LoggingPluginAPI> {
  const { client, apiManager, logger, pluginPath, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("logging requires lib plugin");

  // Initialize services
  loggingService = new LoggingService(client, lib);
  eventService = new LoggingEventService(loggingService, lib);

  // Register API routes
  const router = createLoggingRouter({ loggingService, lib });
  apiManager.registerRouter({
    pluginName: "logging",
    prefix: "/logging",
    router,
    swaggerPaths: [path.join(pluginPath, "api", "*.ts")],
  });

  logger.info("✅ Logging plugin loaded");

  return {
    version: "1.0.0",
    loggingService,
    eventService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  // Stop the debounce cleanup interval
  if (eventService) {
    eventService.stop();
  }
  logger.info("🛑 Logging plugin unloaded");
}

export const commands = "./commands";
