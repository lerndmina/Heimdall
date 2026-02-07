/**
 * Tickets API Routes Index
 *
 * Aggregates all ticket-related API routes into a single router.
 * Registered via apiManager.registerRouter() in the plugin's onLoad.
 */

import { Router } from "express";
import { createTicketsRoutes } from "./tickets.js";
import { createCategoriesRoutes } from "./categories.js";
import { createOpenersRoutes } from "./openers.js";
import { createArchiveConfigRoutes } from "./archive-config.js";
import type { TicketsAPI } from "../index.js";

/**
 * Dependencies required by API routes
 * @deprecated Use createRouter instead
 */
export interface ApiDependencies {
  categoryService: TicketsAPI["categoryService"];
  lifecycleService: TicketsAPI["lifecycleService"];
  lib: TicketsAPI["lib"];
}

/**
 * Create the main tickets router with all sub-routes
 */
export function createRouter(api: TicketsAPI): Router {
  const deps = {
    categoryService: api.categoryService,
    lifecycleService: api.lifecycleService,
    lib: api.lib,
  };
  const router = Router({ mergeParams: true });

  // Mount sub-routers
  // Tickets routes at root (/, /:ticketId, /stats, etc.)
  router.use("/", createTicketsRoutes(deps));

  // Category routes at /categories
  router.use("/categories", createCategoriesRoutes(deps));

  // Opener routes at /openers
  router.use("/openers", createOpenersRoutes(deps));

  // Archive config routes at /archive-config
  router.use("/archive-config", createArchiveConfigRoutes(deps));

  return router;
}
