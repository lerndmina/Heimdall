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
import type { TicketCategoryService } from "../services/TicketCategoryService.js";
import type { TicketLifecycleService } from "../services/TicketLifecycleService.js";
import type { LibAPI } from "../../lib/index.js";

/**
 * Dependencies required by API routes
 */
export interface ApiDependencies {
  categoryService: TicketCategoryService;
  lifecycleService: TicketLifecycleService;
  lib: LibAPI;
}

/**
 * Create the main tickets router with all sub-routes
 */
export function createTicketsRouter(deps: ApiDependencies): Router {
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
