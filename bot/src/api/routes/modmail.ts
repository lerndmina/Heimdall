import { Router } from "express";
import {
  getModmailThread,
  getModmailThreads,
  validateUserAccess,
  generateTranscript,
  getUserTickets,
} from "../controllers/ModmailController";
import { authenticateApiKey, requireScope } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export function createModmailRoutes(client?: any, handler?: any): Router {
  const router = Router();

  // Middleware to inject client and handler into res.locals
  if (client && handler) {
    router.use((req, res, next) => {
      res.locals.client = client;
      res.locals.handler = handler;
      next();
    });
  }

  // All modmail endpoints require authentication and modmail:read scope
  router.use(authenticateApiKey);
  router.use(requireScope("modmail:read"));

  /**
   * GET /api/modmail/:guildId/threads
   * Get a list of modmail threads for a guild with pagination and filtering
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - status: 'open' | 'closed' | 'resolved' | 'all' (default: 'all')
   * - userId: Filter by specific user (optional)
   * - search: Search in userDisplayName and message content (optional)
   * - sortBy: 'lastActivity' | 'created' | 'resolved' | 'closed' (default: 'lastActivity')
   * - sortOrder: 'asc' | 'desc' (default: 'desc')
   */
  router.get("/:guildId/threads", asyncHandler(getModmailThreads));

  /**
   * GET /api/modmail/:guildId/threads/:threadId
   * Get detailed information about a specific modmail thread
   * Query params:
   * - includeMessages: Include messages in response (default: true)
   */
  router.get("/:guildId/threads/:threadId", asyncHandler(getModmailThread));

  /**
   * GET /api/modmail/:guildId/threads/:threadId/transcript
   * Generate transcript for a modmail thread
   * Query params:
   * - format: 'html' | 'json' (default: 'html')
   */
  router.get("/:guildId/threads/:threadId/transcript", asyncHandler(generateTranscript));

  /**
   * GET /api/modmail/auth/validate-user/:userId
   * Validate user permissions for guild access (for dashboard authentication)
   * Query params:
   * - guildId: Specific guild to check (optional, checks all if not provided)
   */
  router.get("/auth/validate-user/:userId", asyncHandler(validateUserAccess));

  /**
   * GET /api/modmail/user/:userId/tickets
   * Get all modmail tickets for a specific user across all guilds
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - status: 'open' | 'closed' | 'all' (default: 'all')
   * - guildId: Filter by specific guild (optional)
   * - sortBy: 'lastActivity' | 'created' | 'closed' (default: 'lastActivity')
   * - sortOrder: 'asc' | 'desc' (default: 'desc')
   */
  router.get("/user/:userId/tickets", asyncHandler(getUserTickets));

  return router;
}
