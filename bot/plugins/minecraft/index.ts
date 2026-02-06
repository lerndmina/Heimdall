/**
 * Minecraft Plugin — Whitelist linking, role sync, and Java plugin API.
 *
 * Provides:
 * - /link-minecraft — Start account linking flow
 * - /confirm-code — Confirm 6-digit auth code
 * - /minecraft-status — Check linking status
 * - /minecraft-setup — Admin configuration
 * - Auto-whitelist on member rejoin
 * - Revoke whitelist on member leave
 * - REST API for Java Minecraft plugin communication
 * - Discord ↔ Minecraft role synchronization
 */

import path from "path";
import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import models to register with Mongoose
import "./models/MinecraftConfig.js";
import "./models/MinecraftPlayer.js";
import "./models/RoleSyncLog.js";
import "./models/McServerStatus.js";

// Import services
import { RoleSyncService } from "./services/RoleSyncService.js";
import { MinecraftLeaveService } from "./services/MinecraftLeaveService.js";

// Import API router factory
import { createMinecraftRouter } from "./api/index.js";

/** Public API exposed to other plugins and event handlers */
export interface MinecraftPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  roleSyncService: RoleSyncService;
  leaveService: typeof MinecraftLeaveService;
}

let roleSyncService: RoleSyncService;

export async function onLoad(context: PluginContext): Promise<MinecraftPluginAPI> {
  const { client, apiManager, logger, pluginPath, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("minecraft requires lib plugin");

  // Initialize services
  roleSyncService = new RoleSyncService(lib);

  // Register API routes
  const router = createMinecraftRouter({ roleSyncService, lib });
  apiManager.registerRouter({
    pluginName: "minecraft",
    prefix: "/minecraft",
    router,
    swaggerPaths: [path.join(pluginPath, "api", "*.ts")],
  });

  logger.info("✅ Minecraft plugin loaded");

  return {
    version: "1.0.0",
    lib,
    roleSyncService,
    leaveService: MinecraftLeaveService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Minecraft plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
