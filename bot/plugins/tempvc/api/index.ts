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
import type { TempVCPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type TempVCApiDependencies = Pick<TempVCPluginAPI, "tempVCService" | "lib">;

export function createRouter(api: TempVCPluginAPI): Router {
  const deps = { tempVCService: api.tempVCService, lib: api.lib };
  const router = Router({ mergeParams: true });

  router.use("/config", createConfigRoutes(deps));
  router.use("/config", createConfigUpdateRoutes(deps));
  router.use("/active", createActiveListRoutes(deps));
  router.use("/stats", createStatsRoutes(deps));
  router.use("/channels", createChannelDeleteRoutes(deps));

  return router;
}
