/**
 * PlanetSide 2 Plugin — Account linking, Census/Honu monitoring, outfit integration.
 *
 * Provides:
 * - /ps2-link — Link PlanetSide 2 character to Discord
 * - /ps2-info — View character stats and online status
 * - /ps2-lookup — Admin character management
 * - /ps2-population — Live world population
 * - /ps2-setup — Admin configuration
 * - /ps2-promote — Find members needing outfit promotion
 * - /ps2-outfit — Outfit info display
 * - Census/Honu API health monitoring
 * - Auto-role on member rejoin
 * - Role revocation on member leave
 * - REST API for dashboard integration
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import models to register with Mongoose
import "./models/PlanetSideConfig.js";
import "./models/PlanetSidePlayer.js";
import "./models/CensusStatus.js";

// Import services
import { PlanetSideApiService } from "./services/PlanetSideApiService.js";
import { CensusMonitorService } from "./services/CensusMonitorService.js";
import { PlanetSidePanelService } from "./services/PlanetSidePanelService.js";
import { PlanetSideLeaveService } from "./services/PlanetSideLeaveService.js";

/** Public API exposed to other plugins, event handlers, and API routes */
export interface PlanetSidePluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  apiService: PlanetSideApiService;
  censusMonitorService: CensusMonitorService;
  panelService: PlanetSidePanelService;
  leaveService: typeof PlanetSideLeaveService;
}

let apiService: PlanetSideApiService;
let censusMonitorService: CensusMonitorService;
let panelService: PlanetSidePanelService;

export async function onLoad(context: PluginContext): Promise<PlanetSidePluginAPI> {
  const { client, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("planetside requires lib plugin");

  // Initialize services
  const censusServiceId = process.env.CENSUS_SERVICE_ID || "s:example";
  const honuBaseUrl = process.env.HONU_BASE_URL || "https://wt.honu.pw";

  apiService = new PlanetSideApiService(censusServiceId, honuBaseUrl);
  censusMonitorService = new CensusMonitorService(client, lib, apiService);
  panelService = new PlanetSidePanelService(lib, lib.componentCallbackService, logger, apiService);
  panelService.initialize();

  logger.debug("✅ PlanetSide plugin loaded");

  return {
    version: "1.0.0",
    lib,
    apiService,
    censusMonitorService,
    panelService,
    leaveService: PlanetSideLeaveService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  // Stop all census monitoring intervals
  censusMonitorService?.stopAll();
  logger.info("🛑 PlanetSide plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
