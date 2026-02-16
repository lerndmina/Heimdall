/**
 * Dev Plugin API - Development and migration endpoints
 */

import { Router } from "express";
import type { PluginContext } from "../../../src/types/Plugin.js";
import { createMigrateRoutes } from "./migrate.js";
import { createCloneRoutes } from "./clone.js";
import { createBotOwnerRoutes } from "./bot-owner.js";

export interface DevApiDependencies {
  lib: any;
}

export function createDevApi(deps: DevApiDependencies): Router {
  const router = Router();

  // GET /api/dev/bot-owner - Check if user is bot owner
  router.use("/bot-owner", createBotOwnerRoutes(deps));

  // POST /api/dev/migrate - Run database migration (legacy import)
  router.use("/migrate", createMigrateRoutes(deps));

  // POST /api/dev/clone - Clone from another Heimdall instance
  router.use("/clone", createCloneRoutes(deps));

  return router;
}
