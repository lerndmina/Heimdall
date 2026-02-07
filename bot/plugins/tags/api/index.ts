/**
 * Tags API Router Factory
 *
 * Mounted at: /api/guilds/:guildId/tags
 */

import { Router } from "express";
import { createTagListRoutes } from "./list.js";
import { createTagGetRoutes } from "./get.js";
import { createTagCreateRoutes } from "./create.js";
import { createTagUpdateRoutes } from "./update.js";
import { createTagDeleteRoutes } from "./delete.js";
import { createTagUseRoutes } from "./use.js";
import type { TagsPluginAPI } from "../index.js";

/** @deprecated Use createRouter instead */
export type TagsApiDependencies = Pick<TagsPluginAPI, "tagService" | "lib">;

export function createRouter(api: TagsPluginAPI): Router {
  const deps = { tagService: api.tagService, lib: api.lib };
  const router = Router({ mergeParams: true });

  // GET    /api/guilds/:guildId/tags
  router.use("/", createTagListRoutes(deps));

  // POST   /api/guilds/:guildId/tags
  router.use("/", createTagCreateRoutes(deps));

  // GET    /api/guilds/:guildId/tags/:name
  router.use("/", createTagGetRoutes(deps));

  // PUT    /api/guilds/:guildId/tags/:name
  router.use("/", createTagUpdateRoutes(deps));

  // DELETE /api/guilds/:guildId/tags/:name
  router.use("/", createTagDeleteRoutes(deps));

  // POST   /api/guilds/:guildId/tags/:name/use
  router.use("/", createTagUseRoutes(deps));

  return router;
}
