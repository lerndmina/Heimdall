import { Router } from "express";
import {
  getModmailThreads,
  getModmailThread,
  getModmailStats,
  getModmailConfig,
  updateModmailConfig,
  getModmailMessages,
  validateUserAccess,
  generateTranscript,
  searchModmail,
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
   * Get all modmail threads for a guild with pagination and filtering
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   * - status: 'open' | 'closed' | 'all' (default: 'all')
   * - userId: Filter by specific user ID
   * - search: Search in user names and message content
   * - sortBy: 'lastActivity' | 'created' | 'resolved' (default: 'lastActivity')
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
   * GET /api/modmail/:guildId/threads/:threadId/messages
   * Get messages from a specific modmail thread with pagination
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 50, max: 200)
   * - type: 'user' | 'staff' - Filter by message type
   * - search: Search in message content and author names
   */
  router.get("/:guildId/threads/:threadId/messages", asyncHandler(getModmailMessages));

  /**
   * GET /api/modmail/:guildId/stats
   * Get modmail statistics for a guild
   * Query params:
   * - timeframe: '24h' | '7d' | '30d' | 'all' (default: '30d')
   */
  router.get("/:guildId/stats", asyncHandler(getModmailStats));

  /**
   * GET /api/modmail/:guildId/config
   * Get modmail configuration for a guild
   */
  router.get("/:guildId/config", asyncHandler(getModmailConfig));

  /**
   * POST /api/modmail/:guildId/config
   * Update modmail configuration for a guild
   */
  router.post("/:guildId/config", requireScope("modmail:write"), asyncHandler(updateModmailConfig));

  /**
   * GET /api/modmail/:guildId/search
   * Search across all modmail threads and messages
   * Query params:
   * - q: Search query (required, min 2 chars)
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 50)
   * - status: 'open' | 'closed' | 'resolved' | 'all' (default: 'all')
   * - dateFrom: Start date filter (ISO string)
   * - dateTo: End date filter (ISO string)
   * - authorId: Filter by author ID
   */
  router.get("/:guildId/search", asyncHandler(searchModmail));

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
