/**
 * PUT /api/guilds/:guildId/modmail/config
 * Update modmail configuration for a guild
 */

import type { Request, Response, NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import ModmailConfig from "../models/ModmailConfig.js";
import { createLogger } from "../../../src/core/Logger.js";
import { MAX_MODMAIL_CATEGORIES, MAX_MODMAIL_STAFF_ROLES, MAX_MODMAIL_FORM_FIELDS, MAX_NAME_LENGTH } from "../../../src/core/DashboardLimits.js";

const log = createLogger("modmail:api:config-update");

/**
 * Request body for config update
 */
interface ConfigUpdateRequest {
  threadNamingPattern?: string;
  minimumMessageLength?: number;
  globalStaffRoleIds?: string[];
  autoCloseHours?: number | null;
  autoCloseWarningHours?: number;
  rateLimitSeconds?: number;
  allowAttachments?: boolean;
  maxAttachmentSizeMB?: number;
  trackUserActivity?: boolean;
  trackStaffActivity?: boolean;
  enabled?: boolean;
  defaultCategoryId?: string | null;
  categories?: Array<{
    id: string;
    name: string;
    description?: string;
    emoji?: string;
    forumChannelId: string;
    webhookId?: string; // optional — auto-created if absent
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
}

/**
 * @swagger
 * /api/guilds/{guildId}/modmail/config:
 *   put:
 *     summary: Update modmail configuration
 *     description: Update the modmail configuration settings for a guild. Only provided fields will be updated. Does not allow category updates through this endpoint.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Enable or disable the modmail system
 *               threadNamingPattern:
 *                 type: string
 *                 description: Pattern for thread names (supports {number}, {username}, {category})
 *               minimumMessageLength:
 *                 type: integer
 *                 minimum: 1
 *                 description: Minimum message length required
 *               globalStaffRoleIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Role IDs that have staff access to all modmail
 *               allowAttachments:
 *                 type: boolean
 *                 description: Allow file attachments in modmail
 *               autoCloseHours:
 *                 type: integer
 *                 minimum: 1
 *                 nullable: true
 *                 description: Hours of inactivity before auto-close (null to disable)
 *               autoCloseWarningHours:
 *                 type: integer
 *                 minimum: 1
 *                 description: Hours before auto-close to send warning
 *               rateLimitSeconds:
 *                 type: integer
 *                 minimum: 0
 *                 description: Rate limit between user messages in seconds
 *               maxAttachmentSizeMB:
 *                 type: number
 *                 minimum: 0
 *                 description: Maximum attachment size in MB
 *               trackUserActivity:
 *                 type: boolean
 *                 description: Track user activity timestamps
 *               trackStaffActivity:
 *                 type: boolean
 *                 description: Track staff activity timestamps
 *               defaultCategoryId:
 *                 type: string
 *                 nullable: true
 *                 description: Default category ID for new modmail
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request body
 *       404:
 *         description: Modmail not configured for this guild
 *       500:
 *         description: Server error
 */
export function configUpdateRoute(deps: ApiDependencies) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guildId = req.params.guildId as string;
      const updateData: ConfigUpdateRequest = req.body;

      // Validate request body
      if (!updateData || typeof updateData !== "object") {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_REQUEST_BODY",
            message: "Request body must be a valid JSON object",
          },
        });
        return;
      }

      // Find existing configuration — or create a new one if upsert requested
      let config = await ModmailConfig.findOne({ guildId });
      const isCreate = !config;

      if (!config) {
        // Upsert: create a new config with defaults
        config = new ModmailConfig({ guildId });
      }

      // Validate specific fields if provided
      if (updateData.autoCloseHours !== undefined && updateData.autoCloseHours !== null) {
        if (updateData.autoCloseHours < 1 || updateData.autoCloseHours > 8760) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "autoCloseHours must be between 1 and 8760 (1 year)",
            },
          });
          return;
        }
      }

      if (updateData.autoCloseWarningHours !== undefined) {
        if (updateData.autoCloseWarningHours < 1 || updateData.autoCloseWarningHours > 168) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "autoCloseWarningHours must be between 1 and 168 (1 week)",
            },
          });
          return;
        }
      }

      if (updateData.minimumMessageLength !== undefined) {
        if (updateData.minimumMessageLength < 1 || updateData.minimumMessageLength > 4000) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "minimumMessageLength must be between 1 and 4000",
            },
          });
          return;
        }
      }

      if (updateData.rateLimitSeconds !== undefined) {
        if (updateData.rateLimitSeconds < 0 || updateData.rateLimitSeconds > 3600) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "rateLimitSeconds must be between 0 and 3600 (1 hour)",
            },
          });
          return;
        }
      }

      if (updateData.maxAttachmentSizeMB !== undefined) {
        if (updateData.maxAttachmentSizeMB < 0 || updateData.maxAttachmentSizeMB > 100) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: "maxAttachmentSizeMB must be between 0 and 100",
            },
          });
          return;
        }
      }

      // Validate threadNamingPattern length
      if (updateData.threadNamingPattern !== undefined && updateData.threadNamingPattern.length > MAX_NAME_LENGTH) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: `threadNamingPattern must be ${MAX_NAME_LENGTH} characters or less`,
          },
        });
        return;
      }

      // Validate globalStaffRoleIds array length
      if (updateData.globalStaffRoleIds !== undefined && updateData.globalStaffRoleIds.length > MAX_MODMAIL_STAFF_ROLES) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PARAMETER",
            message: `globalStaffRoleIds cannot exceed ${MAX_MODMAIL_STAFF_ROLES} entries`,
          },
        });
        return;
      }

      // Validate categories array length and inner arrays
      if (updateData.categories !== undefined) {
        if (updateData.categories.length > MAX_MODMAIL_CATEGORIES) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PARAMETER",
              message: `Cannot have more than ${MAX_MODMAIL_CATEGORIES} categories`,
            },
          });
          return;
        }
        for (const cat of updateData.categories) {
          if (cat.staffRoleIds && cat.staffRoleIds.length > MAX_MODMAIL_STAFF_ROLES) {
            res.status(400).json({
              success: false,
              error: {
                code: "INVALID_PARAMETER",
                message: `Category "${cat.name}" cannot have more than ${MAX_MODMAIL_STAFF_ROLES} staff roles`,
              },
            });
            return;
          }
          if (cat.formFields && cat.formFields.length > MAX_MODMAIL_FORM_FIELDS) {
            res.status(400).json({
              success: false,
              error: {
                code: "INVALID_PARAMETER",
                message: `Category "${cat.name}" cannot have more than ${MAX_MODMAIL_FORM_FIELDS} form fields`,
              },
            });
            return;
          }
        }
      }

      // Validate defaultCategoryId if provided (only relevant when categories exist)
      if (updateData.defaultCategoryId !== undefined && updateData.defaultCategoryId !== null) {
        if (config.categories.length > 0) {
          const categoryExists = config.categories.some((cat) => cat.id === updateData.defaultCategoryId);
          if (!categoryExists) {
            res.status(400).json({
              success: false,
              error: {
                code: "INVALID_PARAMETER",
                message: "defaultCategoryId must reference an existing category",
              },
            });
            return;
          }
        }
      }

      // Apply updates
      if (updateData.threadNamingPattern !== undefined) {
        config.threadNamingPattern = updateData.threadNamingPattern;
      }
      if (updateData.minimumMessageLength !== undefined) {
        config.minimumMessageLength = updateData.minimumMessageLength;
      }
      if (updateData.globalStaffRoleIds !== undefined) {
        config.globalStaffRoleIds = updateData.globalStaffRoleIds;
      }
      if (updateData.autoCloseHours !== undefined) {
        // Handle null case by setting to undefined, otherwise use the number
        (config as { autoCloseHours?: number }).autoCloseHours = updateData.autoCloseHours === null ? undefined : updateData.autoCloseHours;
      }
      if (updateData.autoCloseWarningHours !== undefined) {
        config.autoCloseWarningHours = updateData.autoCloseWarningHours;
      }
      if (updateData.rateLimitSeconds !== undefined) {
        config.rateLimitSeconds = updateData.rateLimitSeconds;
      }
      if (updateData.allowAttachments !== undefined) {
        config.allowAttachments = updateData.allowAttachments;
      }
      if (updateData.maxAttachmentSizeMB !== undefined) {
        config.maxAttachmentSizeMB = updateData.maxAttachmentSizeMB;
      }
      if (updateData.trackUserActivity !== undefined) {
        config.trackUserActivity = updateData.trackUserActivity;
      }
      if (updateData.trackStaffActivity !== undefined) {
        config.trackStaffActivity = updateData.trackStaffActivity;
      }
      if (updateData.enabled !== undefined) {
        config.enabled = updateData.enabled;
      }
      if (updateData.defaultCategoryId !== undefined) {
        config.defaultCategoryId = updateData.defaultCategoryId ?? undefined;
      }

      // Update categories if provided
      if (updateData.categories !== undefined) {
        // Resolve webhooks: preserve existing if same channel, otherwise auto-create
        const guild = await deps.lib.thingGetter.getGuild(guildId as string);

        const resolvedCategories: any[] = [];
        for (const incoming of updateData.categories) {
          const existing = (config.categories as any[]).find((c: any) => c.id === incoming.id);
          const sameChannel = existing && existing.forumChannelId === incoming.forumChannelId;
          const hasWebhook = sameChannel && existing.webhookId && existing.encryptedWebhookToken;

          if (hasWebhook) {
            // Preserve existing webhook
            resolvedCategories.push({
              ...incoming,
              webhookId: existing.webhookId,
              encryptedWebhookToken: existing.encryptedWebhookToken,
            });
          } else {
            // Auto-create / get-or-create webhook for this forum channel
            if (!guild) {
              res.status(503).json({
                success: false,
                error: { code: "BOT_NOT_READY", message: "Bot could not resolve Discord guild" },
              });
              return;
            }
            const webhook = await deps.modmailService.ensureWebhook(guild, incoming.forumChannelId);
            if (!webhook) {
              res.status(400).json({
                success: false,
                error: {
                  code: "WEBHOOK_FAILED",
                  message: `Failed to create webhook for forum channel ${incoming.forumChannelId}. Ensure the channel exists and the bot has Manage Webhooks permission.`,
                },
              });
              return;
            }
            resolvedCategories.push({
              ...incoming,
              webhookId: webhook.webhookId,
              encryptedWebhookToken: webhook.encryptedWebhookToken,
            });
          }
        }

        config.categories = resolvedCategories as any;
      }

      await config.save();

      // Invalidate cache after update
      await deps.modmailService.invalidateConfigCache(guildId as string);

      // Build response (excluding sensitive data)
      const response = {
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
        defaultCategoryId: config.defaultCategoryId || undefined,
        categoriesCount: config.categories.length,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      };

      res.status(isCreate ? 201 : 200).json({
        success: true,
        data: response,
      });

      log.info(`Modmail configuration ${isCreate ? "created" : "updated"} for guild ${guildId} via API`);
    } catch (error) {
      log.error("Error updating modmail configuration:", error);
      next(error);
    }
  };
}
