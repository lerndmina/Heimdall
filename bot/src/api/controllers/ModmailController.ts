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
  status?: "open" | "closed" | "resolved" | "all";
  userId?: string;
  search?: string;
  sortBy?: "lastActivity" | "created" | "resolved" | "closed";
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
      if (status === "closed") {
        query.isClosed = true;
      } else if (status === "open") {
        query.isClosed = false;
      } else if (status === "resolved") {
        query.markedResolved = true;
      }
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
      case "closed":
        sortOptions.closedAt = sortOrder === "desc" ? -1 : 1;
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
      Modmail.countDocuments({ ...timeQuery, isClosed: false }),
      Modmail.countDocuments({ ...timeQuery, isClosed: true }),
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
 * Validate user permissions for guild access (for dashboard authentication)
 */
export async function validateUserAccess(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const { guildId } = req.query;

    if (!userId) {
      return res.status(400).json(createErrorResponse("User ID is required", 400, req.requestId));
    }

    // Get Discord client
    const client = res.locals.client as Client;

    // Get user's guild memberships and roles
    const userGuilds: any[] = [];

    if (guildId && typeof guildId === "string") {
      // Check specific guild
      try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        if (member) {
          // Get modmail config to check for staff role
          const config = await ModmailConfig.findOne({ guildId }).lean();
          const hasStaffRole = config?.staffRoleId
            ? member.roles.cache.has(config.staffRoleId)
            : false;

          userGuilds.push({
            guildId: guild.id,
            guildName: guild.name,
            guildIcon: guild.iconURL(),
            hasStaffRole,
            roles: member.roles.cache.map((role) => ({
              id: role.id,
              name: role.name,
            })),
          });
        }
      } catch (error) {
        // User not in guild or guild not found
        log.warn(`User ${userId} not found in guild ${guildId}:`, error);
      }
    } else {
      // Check all guilds the bot is in
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          const member = await guild.members.fetch(userId);
          if (member) {
            // Get modmail config to check for staff role
            const config = await ModmailConfig.findOne({ guildId }).lean();
            const hasStaffRole = config?.staffRoleId
              ? member.roles.cache.has(config.staffRoleId)
              : false;

            userGuilds.push({
              guildId: guild.id,
              guildName: guild.name,
              guildIcon: guild.iconURL(),
              hasStaffRole,
              roles: member.roles.cache.map((role) => ({
                id: role.id,
                name: role.name,
              })),
            });
          }
        } catch (error) {
          // User not in this guild, continue to next
          continue;
        }
      }
    }

    res.json(
      createSuccessResponse(
        {
          userId,
          guilds: userGuilds,
          hasAccess: userGuilds.some((guild) => guild.hasStaffRole),
        },
        req.requestId
      )
    );
  } catch (error) {
    log.error("Error validating user access:", error);
    res.status(500).json(createErrorResponse("Failed to validate user access", 500, req.requestId));
  }
}

/**
 * Generate HTML transcript for a modmail thread
 */
export async function generateTranscript(req: Request, res: Response) {
  try {
    const { guildId, threadId } = req.params;
    const { format = "html" } = req.query;

    const thread = await Modmail.findOne({
      guildId,
      forumThreadId: threadId,
    }).lean();

    if (!thread) {
      return res
        .status(404)
        .json(createErrorResponse("Modmail thread not found", 404, req.requestId));
    }

    // Get Discord client for guild info
    const client = res.locals.client as Client;

    let guildName = "Unknown Guild";
    try {
      const guild = await client.guilds.fetch(guildId);
      guildName = guild.name;
    } catch (error) {
      log.warn(`Could not fetch guild ${guildId} for transcript`);
    }

    if (format === "json") {
      // Return raw JSON transcript
      const jsonTranscript = {
        threadInfo: sanitizeModmailThread(thread),
        messages: (thread.messages || []).map(sanitizeModmailMessage),
        guildName,
        generatedAt: new Date().toISOString(),
      };

      res.json(createSuccessResponse(jsonTranscript, req.requestId));
    } else {
      // Generate HTML transcript
      const html = generateHTMLTranscript(thread, guildName);

      res.setHeader("Content-Type", "text/html");
      res.send(html);
    }
  } catch (error) {
    log.error("Error generating transcript:", error);
    res.status(500).json(createErrorResponse("Failed to generate transcript", 500, req.requestId));
  }
}

/**
 * Search across all modmail threads and messages
 */
export async function searchModmail(req: Request, res: Response) {
  try {
    const { guildId } = req.params;
    const {
      q: query,
      page = 1,
      limit = 20,
      status = "all",
      dateFrom,
      dateTo,
      authorId,
    } = req.query;

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return res
        .status(400)
        .json(
          createErrorResponse("Search query must be at least 2 characters", 400, req.requestId)
        );
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(50, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    const searchQuery: any = {
      guildId,
      $or: [
        { userDisplayName: { $regex: query, $options: "i" } },
        { "messages.content": { $regex: query, $options: "i" } },
        { "messages.authorName": { $regex: query, $options: "i" } },
      ],
    };

    // Add status filter
    if (status !== "all") {
      if (status === "closed") {
        searchQuery.isClosed = true;
      } else if (status === "open") {
        searchQuery.isClosed = false;
      } else if (status === "resolved") {
        searchQuery.markedResolved = true;
      }
    }

    // Add date filters
    if (dateFrom || dateTo) {
      searchQuery.createdAt = {};
      if (dateFrom) {
        searchQuery.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        searchQuery.createdAt.$lte = new Date(dateTo as string);
      }
    }

    // Add author filter
    if (authorId) {
      searchQuery.$or.push({ userId: authorId });
      searchQuery.$or.push({ "messages.authorId": authorId });
    }

    const [results, totalCount] = await Promise.all([
      Modmail.find(searchQuery).sort({ lastUserActivityAt: -1 }).skip(skip).limit(limitNum).lean(),
      Modmail.countDocuments(searchQuery),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json(
      createSuccessResponse(
        {
          results: results.map((thread) => {
            const sanitized = sanitizeModmailThread(thread) as any;
            // Add search highlights or matching message snippets
            if (thread.messages) {
              const matchingMessages = thread.messages.filter(
                (msg: any) =>
                  msg.content.toLowerCase().includes(query.toLowerCase()) ||
                  msg.authorName.toLowerCase().includes(query.toLowerCase())
              );
              sanitized.matchingMessages = matchingMessages.slice(0, 3).map(sanitizeModmailMessage);
            }
            return sanitized;
          }),
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalCount,
            pages: totalPages,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
          query: query,
        },
        req.requestId
      )
    );
  } catch (error) {
    log.error("Error searching modmail:", error);
    res.status(500).json(createErrorResponse("Failed to search modmail", 500, req.requestId));
  }
}

/**
 * Generate HTML transcript content
 */
function generateHTMLTranscript(thread: any, guildName: string): string {
  const messages = (thread.messages || []).sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const getStaticAvatarUrl = (avatarUrl?: string): string | undefined => {
    if (!avatarUrl) return undefined;

    // If it's an animated avatar (starts with a_), convert to static
    if (avatarUrl.includes("a_")) {
      return avatarUrl.replace(/\.gif(\?.*)?$/, ".png$1").replace(/a_/, "");
    }

    // If it's already static or not a Discord CDN URL, return as-is
    return avatarUrl;
  };

  const getDisplayContent = (
    message: any
  ): { displayContent: string; originalContent?: string } => {
    if (message.isEdited && message.editedContent) {
      return {
        displayContent: message.editedContent,
        originalContent: message.content,
      };
    }
    return {
      displayContent: message.content,
    };
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Modmail Transcript - ${escapeHtml(thread.userDisplayName || "Unknown User")}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #36393f;
            color: #dcddde;
            margin: 0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: #2f3136;
            border-radius: 8px;
            overflow: hidden;
        }
        .header {
            background: #5865f2;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .thread-info {
            background: #40444b;
            padding: 15px 20px;
            border-bottom: 1px solid #4f545c;
        }
        .thread-info h3 {
            margin: 0 0 10px 0;
            color: #ffffff;
        }
        .thread-info p {
            margin: 5px 0;
            color: #b9bbbe;
        }
        .messages {
            padding: 20px;
        }
        .message {
            margin-bottom: 20px;
            display: flex;
            align-items: flex-start;
            gap: 15px;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #7289da;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            flex-shrink: 0;
        }
        .message-content {
            flex: 1;
        }
        .message-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 5px;
        }
        .author-name {
            font-weight: 600;
            color: #ffffff;
        }
        .staff {
            color: #43b581;
        }
        .user {
            color: #7289da;
        }
        .timestamp {
            font-size: 0.75rem;
            color: #72767d;
        }
        .message-text {
            color: #dcddde;
            word-wrap: break-word;
            white-space: pre-wrap;
        }
        .attachments {
            margin-top: 10px;
        }
        .attachment {
            background: #40444b;
            border: 1px solid #4f545c;
            border-radius: 4px;
            padding: 10px;
            margin-top: 5px;
            font-size: 0.9rem;
        }
        .footer {
            background: #40444b;
            padding: 15px 20px;
            text-align: center;
            font-size: 0.9rem;
            color: #72767d;
            border-top: 1px solid #4f545c;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-open { background: #3ba55d; color: white; }
        .status-closed { background: #ed4245; color: white; }
        .status-resolved { background: #faa61a; color: white; }
        .message-badge {
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 3px;
            border: 1px solid;
            margin-left: 5px;
        }
        .message-badge.user {
            border-color: #7289da;
            color: #7289da;
        }
        .message-badge.staff {
            border-color: #43b581;
            color: #43b581;
        }
        /* Tooltip styles for edited messages */
        .tooltip {
            position: relative;
            display: inline;
            cursor: help;
        }
        .tooltip .tooltip-content {
            visibility: hidden;
            width: 300px;
            background-color: #18191c;
            color: #dcddde;
            text-align: left;
            border-radius: 6px;
            padding: 10px;
            position: absolute;
            z-index: 1000;
            bottom: 125%;
            left: 50%;
            margin-left: -150px;
            opacity: 0;
            transition: opacity 0.3s;
            border: 1px solid #4f545c;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            font-size: 0.875rem;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .tooltip .tooltip-content::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: #4f545c transparent transparent transparent;
        }
        .tooltip:hover .tooltip-content {
            visibility: visible;
            opacity: 1;
        }
        .tooltip-label {
            font-weight: 600;
            color: #b9bbbe;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Modmail Transcript</h1>
            <p>${escapeHtml(guildName)}</p>
        </div>
        
        <div class="thread-info">
            <h3>${escapeHtml(thread.userDisplayName || "Unknown User")}</h3>
            <p><strong>User ID:</strong> ${thread.userId}</p>
            <p><strong>Thread ID:</strong> ${thread.forumThreadId}</p>
            <p><strong>Created:</strong> ${formatDate(
              thread.createdAt || thread._id?.getTimestamp()
            )}</p>
            ${
              thread.isClosed
                ? `<p><strong>Closed:</strong> ${formatDate(thread.closedAt)} ${
                    thread.closedReason ? `(${escapeHtml(thread.closedReason)})` : ""
                  }</p>`
                : ""
            }
            <p><strong>Status:</strong> 
                <span class="status-badge ${
                  thread.isClosed
                    ? "status-closed"
                    : thread.markedResolved
                    ? "status-resolved"
                    : "status-open"
                }">
                    ${thread.isClosed ? "Closed" : thread.markedResolved ? "Resolved" : "Open"}
                </span>
            </p>
            <p><strong>Total Messages:</strong> ${messages.length}</p>
        </div>
        
        <div class="messages">
            ${messages
              .map((message: any) => {
                const { displayContent, originalContent } = getDisplayContent(message);
                const staticAvatarUrl = getStaticAvatarUrl(message.authorAvatar);

                return `
                <div class="message">
                    <div class="avatar">
                        ${
                          staticAvatarUrl
                            ? `<img src="${staticAvatarUrl}" alt="${escapeHtml(
                                message.authorName
                              )}" style="width: 100%; height: 100%; border-radius: 50%;">`
                            : escapeHtml(message.authorName.charAt(0).toUpperCase())
                        }
                    </div>
                    <div class="message-content">
                        <div class="message-header">
                            <span class="author-name ${
                              message.type === "staff" ? "staff" : "user"
                            }">${escapeHtml(message.authorName)}</span>
                            <span class="message-badge ${
                              message.type === "staff" ? "staff" : "user"
                            }">
                                ${message.type === "staff" ? "Staff" : "User"}
                            </span>
                            <span class="timestamp">${formatDate(message.createdAt)}</span>
                        </div>
                        <div class="message-text">
                            ${
                              message.isEdited && originalContent
                                ? `
                                <span class="tooltip">
                                    ${escapeHtml(displayContent).replace(/\n/g, "<br>")}
                                    <span class="timestamp" style="margin-left: 5px;">(edited)</span>
                                    <div class="tooltip-content">
                                        <div class="tooltip-label">Original message:</div>
                                        ${escapeHtml(originalContent).replace(/\n/g, "<br>")}
                                    </div>
                                </span>
                            `
                                : `
                                ${escapeHtml(displayContent).replace(/\n/g, "<br>")}
                                ${
                                  message.isEdited
                                    ? '<span class="timestamp" style="margin-left: 5px;">(edited)</span>'
                                    : ""
                                }
                            `
                            }
                        </div>
                        ${
                          message.attachments && message.attachments.length > 0
                            ? `
                            <div class="attachments">
                                ${message.attachments
                                  .map(
                                    (att: any) => `
                                    <div class="attachment">
                                        📎 <strong>${escapeHtml(att.filename)}</strong> (${(
                                      att.size / 1024
                                    ).toFixed(1)} KB)
                                        ${
                                          att.url
                                            ? `<br><a href="${att.url}" target="_blank" style="color: #00b0f4;">Download</a>`
                                            : ""
                                        }
                                    </div>
                                `
                                  )
                                  .join("")}
                            </div>
                        `
                            : ""
                        }
                    </div>
                </div>
            `;
              })
              .join("")}
        </div>
        
        <div class="footer">
            <p>Transcript generated on ${formatDate(new Date())}</p>
            <p>Generated by Heimdall Bot Dashboard</p>
        </div>
    </div>
</body>
</html>`;
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
    // Include closure tracking fields
    isClosed: thread.isClosed,
    closedAt: thread.closedAt,
    closedBy: thread.closedBy,
    closedReason: thread.closedReason,
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

/**
 * Get all modmail tickets for a specific user across all guilds
 */
export async function getUserTickets(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 20,
      status = "all",
      guildId,
      search,
      sortBy = "lastActivity",
      sortOrder = "desc",
    } = req.query as ModmailListQuery & { guildId?: string };

    // Validate pagination
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit))); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Build query
    const query: any = { userId };

    // Filter by guild if specified
    if (guildId) {
      query.guildId = guildId;
    }

    // Filter by status
    if (status !== "all") {
      if (status === "closed") {
        query.isClosed = true;
      } else if (status === "open") {
        query.isClosed = false;
      } else if (status === "resolved") {
        query.markedResolved = true;
      }
    }

    // Text search in content
    if (search) {
      query["messages.content"] = { $regex: search, $options: "i" };
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
      case "closed":
        sortOptions.closedAt = sortOrder === "desc" ? -1 : 1;
        break;
      default:
        sortOptions.lastUserActivityAt = -1;
    }

    // Execute queries
    const [threads, totalCount] = await Promise.all([
      Modmail.find(query).sort(sortOptions).skip(skip).limit(limitNum).lean(),
      Modmail.countDocuments(query),
    ]);

    // Get the client from res.locals to fetch guild names
    const client = res.locals.client as Client;

    // Create a map of unique guild IDs to fetch guild names
    const uniqueGuildIds = [...new Set(threads.map((thread) => thread.guildId))];
    const guildNames: { [guildId: string]: string } = {};

    // Fetch guild names from Discord
    for (const guildId of uniqueGuildIds) {
      try {
        const guild = await client.guilds.fetch(guildId);
        guildNames[guildId] = guild.name;
      } catch (error) {
        log.warn(`Failed to fetch guild name for ${guildId}:`, error);
        guildNames[guildId] = `Guild ${guildId}`;
      }
    }

    // Enhance threads with guild names
    const enhancedThreads = threads.map((thread) => {
      const sanitized = sanitizeModmailThread(thread);
      return {
        ...sanitized,
        guildName: guildNames[thread.guildId] || `Guild ${thread.guildId}`,
      };
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json(
      createSuccessResponse(
        {
          tickets: enhancedThreads,
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
    log.error("Error fetching user tickets:", error);
    res.status(500).json(createErrorResponse("Failed to fetch user tickets", 500, req.requestId));
  }
}
