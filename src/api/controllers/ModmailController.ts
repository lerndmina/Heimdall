import { Request, Response } from "express";
import { CommandKit } from "commandkit";
import { Client } from "discord.js";
import Modmail, { ModmailType, ModmailMessageType } from "../../models/Modmail";
import ModmailConfig, { ModmailConfigType } from "../../models/ModmailConfig";
import { createSuccessResponse, createErrorResponse } from "../utils/apiResponse";
import log from "../../utils/log";

interface ModmailListQuery {
  page?: number;
  limit?: number;
  status?: "open" | "closed" | "all";
  userId?: string;
  search?: string;
  sortBy?: "lastActivity" | "created" | "resolved";
  sortOrder?: "asc" | "desc";
}

interface ModmailStats {
  total: number;
  open: number;
  closed: number;
  averageResponseTime?: number;
  totalMessages: number;
}

/**
 * Get all modmail threads for a guild with pagination and filtering
 */
export async function getModmailThreads(req: Request, res: Response) {
  try {
    const { guildId } = req.params;
    const {
      page = 1,
      limit = 20,
      status = "all",
      userId,
      search,
      sortBy = "lastActivity",
      sortOrder = "desc",
    } = req.query as ModmailListQuery;

    // Validate pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit))); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = { guildId };

    // Filter by status
    if (status !== "all") {
      query.markedResolved = status === "closed";
    }

    // Filter by user
    if (userId) {
      query.userId = userId;
    }

    // Text search in user display name or content
    if (search) {
      query.$or = [
        { userDisplayName: { $regex: search, $options: "i" } },
        { "messages.content": { $regex: search, $options: "i" } },
      ];
    }

    // Build sort
    const sortOptions: any = {};
    switch (sortBy) {
      case "lastActivity":
        sortOptions.lastUserActivityAt = sortOrder === "desc" ? -1 : 1;
        break;
      case "created":
        sortOptions.createdAt = sortOrder === "desc" ? -1 : 1;
        break;
      case "resolved":
        sortOptions.resolvedAt = sortOrder === "desc" ? -1 : 1;
        break;
      default:
        sortOptions.lastUserActivityAt = -1;
    }

    // Execute queries
    const [threads, totalCount] = await Promise.all([
      Modmail.find(query).sort(sortOptions).skip(skip).limit(limitNum).lean(),
      Modmail.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json(
      createSuccessResponse(
        {
          threads: threads.map((thread) => sanitizeModmailThread(thread)),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            pages: totalPages,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        },
        req.requestId
      )
    );
  } catch (error) {
    log.error("Error fetching modmail threads:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to fetch modmail threads", 500, req.requestId));
  }
}

/**
 * Get detailed information about a specific modmail thread
 */
export async function getModmailThread(req: Request, res: Response) {
  try {
    const { guildId, threadId } = req.params;
    const { includeMessages = true } = req.query;

    const thread = await Modmail.findOne({
      guildId,
      forumThreadId: threadId,
    }).lean();

    if (!thread) {
      return res
        .status(404)
        .json(createErrorResponse("Modmail thread not found", 404, req.requestId));
    }

    let sanitizedThread = sanitizeModmailThread(thread);

    // Include messages if requested
    if (includeMessages === "true" || includeMessages === true) {
      sanitizedThread.messages = thread.messages?.map(sanitizeModmailMessage) || [];
    } else {
      delete sanitizedThread.messages;
    }

    res.json(createSuccessResponse(sanitizedThread, req.requestId));
  } catch (error) {
    log.error("Error fetching modmail thread:", error);
    res.status(500).json(createErrorResponse("Failed to fetch modmail thread", 500, req.requestId));
  }
}

/**
 * Get modmail statistics for a guild
 */
export async function getModmailStats(req: Request, res: Response) {
  try {
    const { guildId } = req.params;
    const { timeframe = "30d" } = req.query;

    // Calculate date range based on timeframe
    let dateFilter: any = {};
    const now = new Date();

    switch (timeframe) {
      case "24h":
        dateFilter = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
        break;
      case "7d":
        dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case "30d":
        dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
      case "all":
        // No date filter
        break;
      default:
        dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    }

    const baseQuery = { guildId };
    const timeQuery = dateFilter.$gte ? { ...baseQuery, createdAt: dateFilter } : baseQuery;

    // Aggregate statistics
    const [totalStats, openThreads, closedThreads, messageStats] = await Promise.all([
      Modmail.countDocuments(timeQuery),
      Modmail.countDocuments({ ...timeQuery, markedResolved: false }),
      Modmail.countDocuments({ ...timeQuery, markedResolved: true }),
      Modmail.aggregate([
        { $match: timeQuery },
        { $unwind: { path: "$messages", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            staffMessages: {
              $sum: { $cond: [{ $eq: ["$messages.type", "staff"] }, 1, 0] },
            },
            userMessages: {
              $sum: { $cond: [{ $eq: ["$messages.type", "user"] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const stats: ModmailStats = {
      total: totalStats,
      open: openThreads,
      closed: closedThreads,
      totalMessages: messageStats[0]?.totalMessages || 0,
    };

    // Add breakdown if messages exist
    if (messageStats[0]) {
      (stats as any).messageBreakdown = {
        staff: messageStats[0].staffMessages || 0,
        user: messageStats[0].userMessages || 0,
      };
    }

    res.json(createSuccessResponse(stats, req.requestId));
  } catch (error) {
    log.error("Error fetching modmail statistics:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to fetch modmail statistics", 500, req.requestId));
  }
}

/**
 * Get modmail configuration for a guild
 */
export async function getModmailConfig(req: Request, res: Response) {
  try {
    const { guildId } = req.params;

    const config = await ModmailConfig.findOne({ guildId }).lean();

    if (!config) {
      return res
        .status(404)
        .json(
          createErrorResponse("Modmail configuration not found for this guild", 404, req.requestId)
        );
    }

    // Sanitize sensitive data
    const sanitizedConfig = {
      guildId: config.guildId,
      guildDescription: config.guildDescription,
      forumChannelId: config.forumChannelId,
      staffRoleId: config.staffRoleId,
      tags: config.tags,
      inactivityWarningHours: config.inactivityWarningHours,
      autoCloseHours: config.autoCloseHours,
      // Don't expose webhook credentials
      hasWebhook: !!(config.webhookId && config.webhookToken),
    };

    res.json(createSuccessResponse(sanitizedConfig, req.requestId));
  } catch (error) {
    log.error("Error fetching modmail configuration:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to fetch modmail configuration", 500, req.requestId));
  }
}

/**
 * Get messages from a specific modmail thread with pagination
 */
export async function getModmailMessages(req: Request, res: Response) {
  try {
    const { guildId, threadId } = req.params;
    const { page = 1, limit = 50, type, search } = req.query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit))); // Max 200 messages per page

    const thread = await Modmail.findOne({
      guildId,
      forumThreadId: threadId,
    }).lean();

    if (!thread) {
      return res
        .status(404)
        .json(createErrorResponse("Modmail thread not found", 404, req.requestId));
    }

    let messages = [...(thread.messages || [])]; // Convert to regular array

    // Filter by message type
    if (type && (type === "user" || type === "staff")) {
      messages = messages.filter((msg) => msg.type === type);
    }

    // Search in message content
    if (search && typeof search === "string") {
      messages = messages.filter(
        (msg) =>
          msg.content.toLowerCase().includes(search.toLowerCase()) ||
          msg.authorName.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sort by creation date (oldest first for better conversation flow)
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Paginate
    const total = messages.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedMessages = messages.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(total / limitNum);

    res.json(
      createSuccessResponse(
        {
          messages: paginatedMessages.map(sanitizeModmailMessage),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: totalPages,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        },
        req.requestId
      )
    );
  } catch (error) {
    log.error("Error fetching modmail messages:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to fetch modmail messages", 500, req.requestId));
  }
}

/**
 * Sanitize modmail thread data for API response
 */
function sanitizeModmailThread(thread: any) {
  return {
    guildId: thread.guildId,
    forumThreadId: thread.forumThreadId,
    forumChannelId: thread.forumChannelId,
    userId: thread.userId,
    userDisplayName: thread.userDisplayName,
    userAvatar: thread.userAvatar,
    lastUserActivityAt: thread.lastUserActivityAt,
    markedResolved: thread.markedResolved,
    resolvedAt: thread.resolvedAt,
    claimedBy: thread.claimedBy,
    claimedAt: thread.claimedAt,
    autoCloseDisabled: thread.autoCloseDisabled,
    autoCloseScheduledAt: thread.autoCloseScheduledAt,
    inactivityNotificationSent: thread.inactivityNotificationSent,
    messageCount: thread.messages?.length || 0,
    createdAt: thread.createdAt || thread._id?.getTimestamp(),
    messages: thread.messages, // Will be filtered out if not requested
  };
}

/**
 * Sanitize modmail message data for API response
 */
function sanitizeModmailMessage(message: any) {
  return {
    messageId: message.messageId,
    type: message.type,
    content: message.content,
    authorId: message.authorId,
    authorName: message.authorName,
    authorAvatar: message.authorAvatar,
    attachments: message.attachments || [],
    isEdited: message.isEdited,
    editedContent: message.editedContent,
    editedAt: message.editedAt,
    editedBy: message.editedBy,
    createdAt: message.createdAt,
    isDeleted: message.isDeleted,
    deletedAt: message.deletedAt,
    deletedBy: message.deletedBy,
    // Include Discord message references for transcript building
    discordMessageId: message.discordMessageId,
    discordMessageUrl: message.discordMessageUrl,
    webhookMessageId: message.webhookMessageId,
    webhookMessageUrl: message.webhookMessageUrl,
    dmMessageId: message.dmMessageId,
    dmMessageUrl: message.dmMessageUrl,
  };
}
