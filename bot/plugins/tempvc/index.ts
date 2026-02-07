/**
 * TempVC Plugin — Join-to-create temporary voice channel system
 *
 * Provides:
 * - Creator channels that spawn personal temp VCs
 * - Control panel with buttons (rename, lock, ban, limit, invite, delete)
 * - Auto-cleanup when channels are empty
 * - Sequential channel naming with Redis numbering
 * - Dashboard API routes
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import models to register them with Mongoose
import "./models/TempVC.js";
import "./models/ActiveTempChannels.js";

// Import services
import { TempVCService } from "./services/TempVCService.js";
import { TempVCInteractionHandler } from "./services/TempVCInteractionHandler.js";

/** Public API exposed to other plugins */
export interface TempVCPluginAPI extends PluginAPI {
  version: string;
  tempVCService: TempVCService;
  interactionHandler: TempVCInteractionHandler;
  lib: LibAPI;
}

let tempVCService: TempVCService;
let interactionHandler: TempVCInteractionHandler;

export async function onLoad(context: PluginContext): Promise<TempVCPluginAPI> {
  const { client, redis, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("tempvc requires lib plugin");

  // Initialize services
  tempVCService = new TempVCService(client, redis, lib);
  interactionHandler = new TempVCInteractionHandler(client, tempVCService, lib);

  // Wire cross-reference (service needs handler for control panel building)
  tempVCService.setInteractionHandler(interactionHandler);

  // Register persistent interaction handlers
  await interactionHandler.initialize();

  logger.info("✅ TempVC plugin loaded");

  return {
    version: "1.0.0",
    tempVCService,
    interactionHandler,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 TempVC plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
