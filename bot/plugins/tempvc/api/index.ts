/**
 * TempVC API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/tempvc
 */

import { Router } from "express";
import { createConfigRoutes } from "./config-get.js";
import { createConfigUpdateRoutes } from "./config-update.js";
import { createActiveListRoutes } from "./active-list.js";
import { createStatsRoutes } from "./stats.js";
import { createChannelDeleteRoutes } from "./channel-delete.js";
import type { TempVCService } from "../services/TempVCService.js";
import type { LibAPI } from "../../lib/index.js";

export interface TempVCApiDependencies {
  tempVCService: TempVCService;
  lib: LibAPI;
}

export function createTempVCRouter(deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.use("/config", createConfigRoutes(deps));
  router.use("/config", createConfigUpdateRoutes(deps));
  router.use("/active", createActiveListRoutes(deps));
  router.use("/stats", createStatsRoutes(deps));
  router.use("/channels", createChannelDeleteRoutes(deps));

  return router;
}
