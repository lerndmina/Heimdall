/**
 * Suggestions API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/suggestions
 */

import { Router } from "express";
import { createConfigRoutes } from "./config.js";
import { createSuggestionsListRoutes } from "./suggestions-list.js";
import { createSuggestionGetRoutes } from "./suggestion-get.js";
import { createSuggestionStatusRoutes } from "./suggestion-status.js";
import { createSuggestionStatsRoutes } from "./suggestion-stats.js";
import { createOpenerRoutes } from "./openers.js";
import { createCategoryRoutes } from "./categories.js";
import type { SuggestionsPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type SuggestionsApiDependencies = Pick<SuggestionsPluginAPI, "suggestionService" | "lib">;

export function createRouter(api: SuggestionsPluginAPI): Router {
  const deps = { suggestionService: api.suggestionService, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET/PUT   /api/guilds/:guildId/suggestions/config
  router.use("/config", createConfigRoutes(deps));

  // GET       /api/guilds/:guildId/suggestions
  router.use("/", createSuggestionsListRoutes(deps));

  // GET       /api/guilds/:guildId/suggestions/stats
  router.use("/stats", createSuggestionStatsRoutes(deps));

  // GET/PATCH /api/guilds/:guildId/suggestions/:suggestionId
  router.use("/", createSuggestionGetRoutes(deps));
  router.use("/", createSuggestionStatusRoutes(deps));

  // CRUD      /api/guilds/:guildId/suggestions/openers
  router.use("/openers", createOpenerRoutes(deps));

  // CRUD      /api/guilds/:guildId/suggestions/categories
  router.use("/categories", createCategoryRoutes(deps));

  return router;
}
