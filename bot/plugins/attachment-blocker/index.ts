/**
 * Attachment Blocker Plugin — Per-channel and guild-wide attachment type whitelist
 * with media link detection and optional timeout enforcement.
 *
 * Provides:
 * - /attachment-blocker setup|view|disable commands
 * - /attachment-blocker channel add|remove subcommands
 * - messageCreate event handler for enforcement
 * - Dashboard API routes for config CRUD
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import models to register with Mongoose
import "./models/AttachmentBlockerConfig.js";
import "./models/AttachmentBlockerChannel.js";
import "./models/AttachmentBlockerOpener.js";

// Import service
import { AttachmentBlockerService } from "./services/AttachmentBlockerService.js";

/** Public API exposed to other plugins and event handlers */
export interface AttachmentBlockerPluginAPI extends PluginAPI {
  version: string;
  service: AttachmentBlockerService;
  lib: LibAPI;
}

let service: AttachmentBlockerService;

export async function onLoad(context: PluginContext): Promise<AttachmentBlockerPluginAPI> {
  const { client, redis, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("attachment-blocker requires lib plugin");

  // Initialize service
  service = new AttachmentBlockerService(client, redis, lib);

  logger.info("✅ Attachment Blocker plugin loaded");

  return {
    version: "1.0.0",
    service,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Attachment Blocker plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
