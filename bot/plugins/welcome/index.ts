/**
 * Welcome Plugin — Welcome messages for new members with template variables
 *
 * Provides:
 * - Per-guild welcome message configuration (channel + template)
 * - Template variables ({mention}, {username}, {guild}, etc.)
 * - /welcome setup|remove|view|test|variables commands
 * - guildMemberAdd event to auto-send welcome messages
 * - Dashboard API routes for config CRUD, testing, and variable listing
 */

import path from "path";
import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import model to register with Mongoose
import "./models/WelcomeMessage.js";

// Import service
import { WelcomeService } from "./services/WelcomeService.js";

// Import API router factory
import { createWelcomeRouter } from "./api/index.js";

/** Public API exposed to other plugins and event handlers */
export interface WelcomePluginAPI extends PluginAPI {
  version: string;
  welcomeService: WelcomeService;
  lib: LibAPI;
}

let welcomeService: WelcomeService;

export async function onLoad(context: PluginContext): Promise<WelcomePluginAPI> {
  const { client, apiManager, logger, pluginPath, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("welcome requires lib plugin");

  // Initialize service
  welcomeService = new WelcomeService(client, lib);

  // Register API routes
  const router = createWelcomeRouter({ welcomeService, lib });
  apiManager.registerRouter({
    pluginName: "welcome",
    prefix: "/welcome",
    router,
    swaggerPaths: [path.join(pluginPath, "api", "*.ts")],
  });

  logger.info("✅ Welcome plugin loaded");

  return {
    version: "1.0.0",
    welcomeService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Welcome plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
