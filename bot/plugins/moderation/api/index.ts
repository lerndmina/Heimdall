/**
 * Moderation API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/moderation
 */

import { Router } from "express";
import type { ModerationPluginAPI } from "../index.js";
import { createConfigRoutes } from "./config.js";
import { createRulesListRoutes } from "./rules-list.js";
import { createRulesGetRoutes } from "./rules-get.js";
import { createRulesCreateRoutes } from "./rules-create.js";
import { createRulesUpdateRoutes } from "./rules-update.js";
import { createRulesDeleteRoutes } from "./rules-delete.js";
import { createRulesToggleRoutes } from "./rules-toggle.js";
import { createRulesTestRoutes } from "./rules-test.js";
import { createInfractionsRoutes } from "./infractions.js";
import { createPresetsRoutes } from "./presets.js";
import { createStatsRoutes } from "./stats.js";

export type ModerationApiDeps = Pick<
  ModerationPluginAPI,
  "moderationService" | "ruleEngine" | "infractionService" | "escalationService" | "lib"
>;

export function createRouter(api: ModerationPluginAPI): Router {
  const deps: ModerationApiDeps = {
    moderationService: api.moderationService,
    ruleEngine: api.ruleEngine,
    infractionService: api.infractionService,
    escalationService: api.escalationService,
    lib: api.lib,
  };

  const router = Router({ mergeParams: true });

  // Config endpoints
  router.use("/config", createConfigRoutes(deps));

  // Rules CRUD endpoints
  router.use("/rules", createRulesListRoutes(deps));
  router.use("/rules", createRulesCreateRoutes(deps));
  router.use("/rules", createRulesGetRoutes(deps));
  router.use("/rules", createRulesUpdateRoutes(deps));
  router.use("/rules", createRulesDeleteRoutes(deps));
  router.use("/rules", createRulesToggleRoutes(deps));
  router.use("/rules", createRulesTestRoutes(deps));

  // Infractions
  router.use("/infractions", createInfractionsRoutes(deps));

  // Presets
  router.use("/presets", createPresetsRoutes(deps));

  // Stats
  router.use("/stats", createStatsRoutes(deps));

  return router;
}
