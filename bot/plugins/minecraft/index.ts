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
import { MinecraftPanelService } from "./services/MinecraftPanelService.js";

// Import models for migration
import MinecraftConfig from "./models/MinecraftConfig.js";

/** Public API exposed to other plugins and event handlers */
export interface MinecraftPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  roleSyncService: RoleSyncService;
  leaveService: typeof MinecraftLeaveService;
  panelService: MinecraftPanelService;
}

let roleSyncService: RoleSyncService;
let panelService: MinecraftPanelService;

export async function onLoad(context: PluginContext): Promise<MinecraftPluginAPI> {
  const { client, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("minecraft requires lib plugin");

  // Initialize services
  roleSyncService = new RoleSyncService(lib);
  panelService = new MinecraftPanelService(lib, lib.componentCallbackService, logger);
  panelService.initialize();

  // ── One-time migration: fix swapped authSuccessMessage / authPendingMessage defaults ──
  // Previous schema had these two defaults swapped — authSuccessMessage contained an auth code
  // template but was used for welcome-back, and authPendingMessage contained an approval message
  // but was used for showing auth codes. Unset them so the corrected schema defaults take effect.
  try {
    const OLD_AUTH_SUCCESS = "§aYour auth code: §f{code}\n§7Go to Discord and type: §f/confirm-code {code}";
    const OLD_AUTH_PENDING = "§eYour account is linked and waiting for staff approval.\n§7Please be patient while staff review your request.\n§7You will be automatically whitelisted once approved.";

    const migrated = await MinecraftConfig.updateMany(
      {
        $or: [{ authSuccessMessage: OLD_AUTH_SUCCESS }, { authPendingMessage: OLD_AUTH_PENDING }],
      },
      {
        $unset: { authSuccessMessage: "", authPendingMessage: "" },
      },
    );

    if (migrated.modifiedCount > 0) {
      logger.info(`🔧 Migrated ${migrated.modifiedCount} config(s): reset swapped message defaults`);
    }

    // Rename old whitelistPendingMessage → unset it so the new split fields take effect
    const pendingMigrated = await MinecraftConfig.updateMany(
      { whitelistPendingMessage: { $exists: true } },
      { $unset: { whitelistPendingMessage: "" } },
    );
    if (pendingMigrated.modifiedCount > 0) {
      logger.info(`🔧 Migrated ${pendingMigrated.modifiedCount} config(s): removed old whitelistPendingMessage`);
    }
  } catch (err) {
    logger.error("Failed to run message migration:", err);
  }

  logger.debug("✅ Minecraft plugin loaded");

  return {
    version: "1.0.0",
    lib,
    roleSyncService,
    leaveService: MinecraftLeaveService,
    panelService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Minecraft plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
