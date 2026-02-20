/**
 * PlanetSide API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/planetside
 */

import { Router } from "express";
import { createConfigRoutes } from "./config.js";
import { createPlayersRoutes } from "./players.js";
import { createCensusStatusRoutes } from "./census-status.js";
import { createPopulationRoutes } from "./population.js";
import { createOutfitLookupRoutes } from "./outfit-lookup.js";
import type { PlanetSidePluginAPI } from "../index.js";

export type PlanetSideApiDependencies = Pick<PlanetSidePluginAPI, "apiService" | "lib" | "censusMonitorService">;

export function createRouter(api: PlanetSidePluginAPI): Router {
  const deps: PlanetSideApiDependencies = { apiService: api.apiService, lib: api.lib, censusMonitorService: api.censusMonitorService };
  const router = Router({ mergeParams: true });

  // GET/PUT  /api/guilds/:guildId/planetside/config
  router.use("/config", createConfigRoutes(deps));

  // CRUD    /api/guilds/:guildId/planetside/players
  router.use("/players", createPlayersRoutes(deps));

  // GET/POST /api/guilds/:guildId/planetside/census-status
  router.use("/census-status", createCensusStatusRoutes(deps));

  // GET     /api/guilds/:guildId/planetside/population
  router.use("/population", createPopulationRoutes(deps));

  // GET     /api/guilds/:guildId/planetside/outfit-lookup?tag=...
  router.use("/outfit-lookup", createOutfitLookupRoutes(deps));

  return router;
}
