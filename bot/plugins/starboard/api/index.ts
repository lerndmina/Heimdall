import { Router } from "express";
import type { StarboardPluginAPI } from "../index.js";
import { createConfigGetRoutes } from "./config-get.js";
import { createConfigUpdateRoutes } from "./config-update.js";
import { createEntriesRoutes } from "./entries.js";
import { createEmojiRoutes } from "./emojis.js";

export type StarboardApiDependencies = Pick<StarboardPluginAPI, "starboardService" | "lib">;

export function createRouter(api: StarboardPluginAPI): Router {
  const deps: StarboardApiDependencies = {
    starboardService: api.starboardService,
    lib: api.lib,
  };

  const router = Router({ mergeParams: true });

  router.use("/config", createConfigGetRoutes(deps));
  router.use("/config", createConfigUpdateRoutes(deps));
  router.use("/entries", createEntriesRoutes(deps));
  router.use("/emojis", createEmojiRoutes(deps));

  return router;
}
