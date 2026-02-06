/**
 * GET /api/guilds/:guildId/modmail/conversations
 * List modmail conversations with pagination and filtering
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import Modmail, { type IModmail } from "../models/Modmail.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:api:conversations");

/**
 * Conversation list item for API response
 */
interface ModmailConversationListItem {
  id: string;
  ticketNumber: number;
  userId: string;
  userDisplayName: string;
  status: "open" | "resolved" | "closed";
  categoryId?: string;
  categoryName?: string;
  claimedBy?: string;
  messageCount: number;
  lastActivity: string;
  createdAt: string;
  closedAt?: string;
}

/**
 * Query parameters for filtering and pagination
 */
interface ConversationsQuery {
  page?: string;
  limit?: string;
  status?: string;
  categoryId?: string;
  claimedBy?: string;
  userId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/conversations:
 *   get:
 *     summary: List modmail conversations
 *     description: Retrieve paginated list of modmail conversations with filtering and sorting options
 *     tags: [Modmail]
 *     security:
 *       - ApiKey: []
 *       - Bearer: []
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of conversations per page
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [open, resolved, closed]
 *         description: Filter by conversation status
 *       - in: query
 *         name: categoryId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: claimedBy
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by staff member who claimed the conversation
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter by user ID who started the conversation
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Search in conversation subject or user information
 *       - in: query
 *         name: sortBy
 *         required: false
 *         schema:
 *           type: string
 *           enum: [createdAt, lastActivity, messageCount, status]
 *           default: lastActivity
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Paginated list of modmail conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           ticketNumber:
 *                             type: integer
 *                           userId:
 *                             type: string
 *                           userDisplayName:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [open, resolved, closed]
 *                           categoryId:
 *                             type: string
 *                           categoryName:
 *                             type: string
 *                           claimedBy:
 *                             type: string
 *                           messageCount:
 *                             type: integer
 *                           lastActivity:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           closedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *                         hasNextPage:
 *                           type: boolean
 *                         hasPreviousPage:
 *                           type: boolean
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export function conversationsRoute(_deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { guildId } = req.params;
      const { page = "1", limit = "20", status, categoryId, claimedBy, userId, search, sortBy = "lastActivity", sortOrder = "desc" }: ConversationsQuery = req.query;

      // Validate pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(pageNum) || pageNum < 1) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: "Page must be a positive integer",
          },
        });
        return;
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: "Limit must be between 1 and 100",
          },
        });
        return;
      }

      // Validate sort parameters
      const validSortFields = ["createdAt", "lastActivity", "messageCount", "status"];
      const validSortOrders = ["asc", "desc"];

      if (!validSortFields.includes(sortBy)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: `Invalid sortBy field. Must be one of: ${validSortFields.join(", ")}`,
          },
        });
        return;
      }

      if (!validSortOrders.includes(sortOrder)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: "Sort order must be 'asc' or 'desc'",
          },
        });
        return;
      }

      // Build filter query
      const filter: Record<string, unknown> = { guildId };

      if (status) {
        if (!["open", "resolved", "closed"].includes(status)) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "Status must be 'open', 'resolved', or 'closed'",
            },
          });
          return;
        }
        filter.status = status;
      }

      if (categoryId) {
        filter.categoryId = categoryId;
      }

      if (claimedBy) {
        filter.claimedBy = claimedBy;
      }

      if (userId) {
        filter.userId = userId;
      }

      if (search) {
        // Escape regex special characters to prevent injection
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const searchConditions: Record<string, unknown>[] = [
          { userDisplayName: { $regex: escapedSearch, $options: "i" } },
          { userId: { $regex: escapedSearch, $options: "i" } },
          { categoryName: { $regex: escapedSearch, $options: "i" } },
        ];

        // Add ticket number search if search is a number
        const ticketNum = parseInt(search);
        if (!isNaN(ticketNum)) {
          searchConditions.push({ ticketNumber: ticketNum });
        }

        filter.$or = searchConditions;
      }

      // Build sort object
      const sortObj: Record<string, 1 | -1> = {};
      if (sortBy === "lastActivity") {
        sortObj.updatedAt = sortOrder === "asc" ? 1 : -1;
      } else if (sortBy === "messageCount") {
        // For messageCount, we'll sort by metrics.totalMessages
        sortObj["metrics.totalMessages"] = sortOrder === "asc" ? 1 : -1;
      } else {
        sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;
      }

      // Calculate skip value
      const skip = (pageNum - 1) * limitNum;

      // Get total count for pagination
      const totalItems = await Modmail.countDocuments(filter);
      const totalPages = Math.ceil(totalItems / limitNum);

      // Get conversations with pagination
      const conversations = await Modmail.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select({
          modmailId: 1,
          ticketNumber: 1,
          userId: 1,
          userDisplayName: 1,
          status: 1,
          categoryId: 1,
          categoryName: 1,
          claimedBy: 1,
          metrics: 1,
          createdAt: 1,
          updatedAt: 1,
          closedAt: 1,
        })
        .lean<IModmail[]>();

      // Transform conversations for API response
      const conversationList: ModmailConversationListItem[] = conversations.map((conv) => ({
        id: conv.modmailId,
        ticketNumber: conv.ticketNumber,
        userId: conv.userId,
        userDisplayName: conv.userDisplayName || "Unknown User",
        status: conv.status,
        categoryId: conv.categoryId || undefined,
        categoryName: conv.categoryName || undefined,
        claimedBy: conv.claimedBy || undefined,
        messageCount: conv.metrics?.totalMessages || 0,
        lastActivity: conv.updatedAt?.toISOString() || conv.createdAt.toISOString(),
        createdAt: conv.createdAt.toISOString(),
        closedAt: conv.closedAt?.toISOString(),
      }));

      const response = {
        conversations: conversationList,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1,
        },
      };

      res.json({
        success: true,
        data: response,
      });

      log.info(`Modmail conversations listed for guild ${guildId} via API (page ${pageNum}, ${conversationList.length} items)`);
    } catch (error) {
      log.error("Error listing modmail conversations:", error);
      next(error);
    }
  };
}
