/**
 * GET /api/guilds/:guildId/modmail/conversations/:modmailId
 * Get detailed information about a specific modmail conversation
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import Modmail, { type IModmail } from "../models/Modmail.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:api:conversation-details");

/**
 * Message in API response format
 */
interface ModmailMessageResponse {
  messageId: string;
  discordMessageId?: string;
  discordDmMessageId?: string;
  authorId: string;
  authorType: "user" | "staff" | "system";
  context: "dm" | "thread" | "both";
  content?: string;
  isStaffOnly: boolean;
  attachments: Array<{
    discordId?: string;
    filename: string;
    url: string;
    proxyUrl?: string;
    size?: number;
    contentType?: string;
    spoiler: boolean;
  }>;
  embedData?: unknown;
  timestamp: string;
  deliveredToDm: boolean;
  deliveredToThread: boolean;
  deliveryError?: string;
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

/**
 * Full conversation details response
 */
interface ModmailConversationDetails {
  id: string;
  ticketNumber: number;
  guildId: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  status: "open" | "resolved" | "closed";
  forumChannelId: string;
  forumThreadId: string;
  categoryId?: string;
  categoryName?: string;
  formResponses: Array<{
    fieldId: string;
    fieldLabel: string;
    fieldType: "short" | "paragraph" | "select" | "number";
    value: string;
  }>;
  claimedBy?: string;
  claimedAt?: string;
  markedResolvedBy?: string;
  markedResolvedAt?: string;
  resolveAutoCloseAt?: string;
  closedBy?: string;
  closedAt?: string;
  closeReason?: string;
  lastUserActivityAt: string;
  lastStaffActivityAt?: string;
  autoCloseScheduledAt?: string;
  autoCloseWarningAt?: string;
  createdVia: "dm" | "command" | "button" | "api";
  messages: ModmailMessageResponse[];
  metrics: {
    totalMessages: number;
    userMessages: number;
    staffMessages: number;
    systemMessages: number;
    staffOnlyMessages: number;
    totalAttachments: number;
    firstStaffResponseTime?: number;
    averageResponseTime?: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/conversations/{modmailId}:
 *   get:
 *     summary: Get modmail conversation details
 *     description: Retrieve detailed information about a specific modmail conversation including all messages
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
 *       - in: path
 *         name: modmailId
 *         required: true
 *         schema:
 *           type: string
 *         description: Modmail conversation ID (modmailId field)
 *     responses:
 *       200:
 *         description: Modmail conversation details
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
 *                     id:
 *                       type: string
 *                     ticketNumber:
 *                       type: integer
 *                     guildId:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     userDisplayName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [open, resolved, closed]
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           messageId:
 *                             type: string
 *                           authorId:
 *                             type: string
 *                           authorType:
 *                             type: string
 *                             enum: [user, staff, system]
 *                           content:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalMessages:
 *                           type: integer
 *                         userMessages:
 *                           type: integer
 *                         staffMessages:
 *                           type: integer
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Server error
 */
export function conversationDetailsRoute(_deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { guildId, modmailId } = req.params;

      // Find the modmail conversation
      const modmail = await Modmail.findOne({
        guildId,
        modmailId,
      }).lean<IModmail>();

      if (!modmail) {
        res.status(404).json({
          success: false,
          error: {
            code: "MODMAIL_NOT_FOUND",
            message: "Modmail conversation not found",
          },
        });
        return;
      }

      // Transform messages for API response
      const messages: ModmailMessageResponse[] = (modmail.messages || []).map((msg) => ({
        messageId: msg.messageId,
        discordMessageId: msg.discordMessageId || undefined,
        discordDmMessageId: msg.discordDmMessageId || undefined,
        authorId: msg.authorId,
        authorType: msg.authorType,
        context: msg.context,
        content: msg.content || undefined,
        isStaffOnly: msg.isStaffOnly,
        attachments: (msg.attachments || []).map((att) => ({
          discordId: att.discordId || undefined,
          filename: att.filename,
          url: att.url,
          proxyUrl: att.proxyUrl || undefined,
          size: att.size || undefined,
          contentType: att.contentType || undefined,
          spoiler: att.spoiler,
        })),
        embedData: msg.embedData || undefined,
        timestamp: msg.timestamp.toISOString(),
        deliveredToDm: msg.deliveredToDm,
        deliveredToThread: msg.deliveredToThread,
        deliveryError: msg.deliveryError || undefined,
        isEdited: msg.isEdited || undefined,
        editedAt: msg.editedAt?.toISOString(),
        isDeleted: msg.isDeleted || undefined,
        deletedAt: msg.deletedAt?.toISOString(),
      }));

      // Build response data
      const conversationDetails: ModmailConversationDetails = {
        id: modmail.modmailId,
        ticketNumber: modmail.ticketNumber,
        guildId: modmail.guildId,
        userId: modmail.userId,
        userDisplayName: modmail.userDisplayName,
        userAvatarUrl: modmail.userAvatarUrl || undefined,
        status: modmail.status,
        forumChannelId: modmail.forumChannelId,
        forumThreadId: modmail.forumThreadId,
        categoryId: modmail.categoryId || undefined,
        categoryName: modmail.categoryName || undefined,
        formResponses: (modmail.formResponses || []).map((response) => ({
          fieldId: response.fieldId,
          fieldLabel: response.fieldLabel,
          fieldType: response.fieldType,
          value: response.value,
        })),
        claimedBy: modmail.claimedBy || undefined,
        claimedAt: modmail.claimedAt?.toISOString(),
        markedResolvedBy: modmail.markedResolvedBy || undefined,
        markedResolvedAt: modmail.markedResolvedAt?.toISOString(),
        resolveAutoCloseAt: modmail.resolveAutoCloseAt?.toISOString(),
        closedBy: modmail.closedBy || undefined,
        closedAt: modmail.closedAt?.toISOString(),
        closeReason: modmail.closeReason || undefined,
        lastUserActivityAt: modmail.lastUserActivityAt.toISOString(),
        lastStaffActivityAt: modmail.lastStaffActivityAt?.toISOString(),
        autoCloseScheduledAt: modmail.autoCloseScheduledAt?.toISOString(),
        autoCloseWarningAt: modmail.autoCloseWarningAt?.toISOString(),
        createdVia: modmail.createdVia,
        messages,
        metrics: {
          totalMessages: modmail.metrics?.totalMessages || 0,
          userMessages: modmail.metrics?.userMessages || 0,
          staffMessages: modmail.metrics?.staffMessages || 0,
          systemMessages: modmail.metrics?.systemMessages || 0,
          staffOnlyMessages: modmail.metrics?.staffOnlyMessages || 0,
          totalAttachments: modmail.metrics?.totalAttachments || 0,
          firstStaffResponseTime: modmail.metrics?.firstStaffResponseTime || undefined,
          averageResponseTime: modmail.metrics?.averageResponseTime || undefined,
        },
        createdAt: modmail.createdAt.toISOString(),
        updatedAt: modmail.updatedAt.toISOString(),
      };

      res.json({
        success: true,
        data: conversationDetails,
      });

      log.info(`Modmail conversation ${modmailId} details retrieved for guild ${guildId} via API`);
    } catch (error) {
      log.error("Error retrieving modmail conversation:", error);
      next(error);
    }
  };
}
