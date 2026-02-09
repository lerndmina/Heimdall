/**
 * Dev Plugin API - Development and migration endpoints
 */

import { Router } from "express";
import type { PluginContext } from "../../../src/types/Plugin.js";
import { createMigrateRoutes } from "./migrate.js";
import { createBotOwnerRoutes } from "./bot-owner.js";

export interface DevApiDependencies {
  lib: any;
}

export function createDevApi(deps: DevApiDependencies): Router {
  const router = Router();

  // GET /api/dev/bot-owner - Check if user is bot owner
  router.use("/bot-owner", createBotOwnerRoutes(deps));

  // POST /api/dev/migrate - Run database migration
  router.use("/migrate", createMigrateRoutes(deps));

  return router;
}
