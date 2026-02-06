/**
 * Modmail API Router Factory
 *
 * Creates the Express router with all modmail routes.
 * Routes are mounted under `/api/guilds/:guildId/modmail/`
 */

import { Router } from "express";
import type { ModmailService } from "../services/ModmailService.js";
import type { ModmailCategoryService } from "../services/ModmailCategoryService.js";
import type { LibAPI } from "../../lib/index.js";

import { conversationsRoute } from "./conversations.js";
import { conversationDetailsRoute } from "./conversation-details.js";
import { configGetRoute } from "./config-get.js";
import { configUpdateRoute } from "./config-update.js";
import { statsRoute } from "./stats.js";

/**
 * Dependencies required by API routes
 */
export interface ApiDependencies {
  modmailService: ModmailService;
  categoryService: ModmailCategoryService;
  lib: LibAPI;
}

/**
 * Create the modmail API router
 *
 * @param deps - Service dependencies for route handlers
 * @returns Express router with all modmail routes
 */
export function createModmailRouter(deps: ApiDependencies): Router {
  const router = Router({ mergeParams: true }); // mergeParams to access :guildId from parent

  // GET /conversations - List conversations with pagination and filtering
  router.get("/conversations", conversationsRoute(deps));

  // GET /conversations/:modmailId - Get conversation details with messages
  router.get("/conversations/:modmailId", conversationDetailsRoute(deps));

  // GET /config - Get modmail configuration
  router.get("/config", configGetRoute(deps));

  // PUT /config - Update modmail configuration
  router.put("/config", configUpdateRoute(deps));

  // GET /stats - Get modmail statistics
  router.get("/stats", statsRoute(deps));

  return router;
}
