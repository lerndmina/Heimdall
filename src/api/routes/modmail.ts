import { Router } from "express";
import {
  getModmailThreads,
  getModmailThread,
  getModmailStats,
  getModmailConfig,
  getModmailMessages,
} from "../controllers/ModmailController";
import { authenticateApiKey, requireScope } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export function createModmailRoutes(): Router {
  const router = Router();

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

  return router;
}
