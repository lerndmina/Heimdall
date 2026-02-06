/**
 * GET /api/guilds/:guildId/modmail/config
 * Get modmail configuration for a guild
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:api:config-get");

/**
 * Modmail configuration response
 */
interface ModmailConfigResponse {
  guildId: string;
  threadNamingPattern: string;
  minimumMessageLength: number;
  globalStaffRoleIds: string[];
  autoCloseHours?: number;
  autoCloseWarningHours: number;
  rateLimitSeconds: number;
  allowAttachments: boolean;
  maxAttachmentSizeMB: number;
  trackUserActivity: boolean;
  trackStaffActivity: boolean;
  enabled: boolean;
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    emoji?: string;
    forumChannelId: string;
    webhookId: string;
    staffRoleIds: string[];
    priority: number;
    formFields: Array<{
      id: string;
      label: string;
      placeholder?: string;
      required: boolean;
      type: string;
      options?: Array<{ label: string; value: string }>;
    }>;
    autoCloseHours?: number;
    resolveAutoCloseHours: number;
    enabled: boolean;
  }>;
  defaultCategoryId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/config:
 *   get:
 *     summary: Get modmail configuration
 *     description: Retrieve the complete modmail configuration for a guild including categories and form fields. Does not expose sensitive data like webhook tokens.
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
 *     responses:
 *       200:
 *         description: Modmail configuration
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
 *                     guildId:
 *                       type: string
 *                     enabled:
 *                       type: boolean
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           forumChannelId:
 *                             type: string
 *       404:
 *         description: Modmail not configured for this guild
 *       500:
 *         description: Server error
 */
export function configGetRoute(deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guildId = req.params.guildId as string;

      const config = await deps.modmailService.getConfig(guildId);

      if (!config) {
        res.status(404).json({
          success: false,
          error: {
            code: "MODMAIL_NOT_CONFIGURED",
            message: "Modmail is not configured for this guild",
          },
        });
        return;
      }

      // Build response (excluding sensitive data like webhook tokens)
      const response: ModmailConfigResponse = {
        guildId: config.guildId,
        threadNamingPattern: config.threadNamingPattern,
        minimumMessageLength: config.minimumMessageLength,
        globalStaffRoleIds: config.globalStaffRoleIds,
        autoCloseHours: config.autoCloseHours,
        autoCloseWarningHours: config.autoCloseWarningHours,
        rateLimitSeconds: config.rateLimitSeconds,
        allowAttachments: config.allowAttachments,
        maxAttachmentSizeMB: config.maxAttachmentSizeMB,
        trackUserActivity: config.trackUserActivity,
        trackStaffActivity: config.trackStaffActivity,
        enabled: config.enabled,
        categories: config.categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description || undefined,
          emoji: cat.emoji || undefined,
          forumChannelId: cat.forumChannelId,
          webhookId: cat.webhookId,
          // Note: encryptedWebhookToken is intentionally NOT exposed
          staffRoleIds: cat.staffRoleIds,
          priority: cat.priority,
          formFields: cat.formFields.map((field) => ({
            id: field.id,
            label: field.label,
            placeholder: field.placeholder || undefined,
            required: field.required,
            type: field.type,
            options: field.options ? field.options.map((opt) => ({ label: opt.label, value: opt.value })) : undefined,
          })),
          autoCloseHours: cat.autoCloseHours,
          resolveAutoCloseHours: cat.resolveAutoCloseHours,
          enabled: cat.enabled,
        })),
        defaultCategoryId: config.defaultCategoryId || undefined,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      };

      res.json({
        success: true,
        data: response,
      });

      log.info(`Modmail config retrieved for guild ${guildId} via API`);
    } catch (error) {
      log.error("Error retrieving modmail config:", error);
      next(error);
    }
  };
}
