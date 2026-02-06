/**
 * Archive Config API Routes
 *
 * Handles archive configuration for the guild.
 *
 * @swagger
 * tags:
 *   - name: Archive Config
 *     description: Archive configuration endpoints
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ApiDependencies } from "./index.js";
import TicketArchiveConfig from "../models/TicketArchiveConfig.js";

export function createArchiveConfigRoutes(_deps: ApiDependencies): Router {
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/archive-config:
   *   get:
   *     summary: Get archive configuration
   *     description: Returns the archive configuration for the guild
   *     tags: [Archive Config]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Archive configuration
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const config = await TicketArchiveConfig.findOne({ guildId });

      if (!config) {
        // Return defaults if not configured
        res.json({
          success: true,
          data: {
            guildId,
            archiveCategoryId: null,
            archiveExpireDays: 30,
            transcriptChannelId: null,
            transcriptWebhookUrl: null,
            configured: false,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId: config.guildId,
          archiveCategoryId: config.archiveCategoryId,
          archiveExpireDays: config.archiveExpireDays,
          transcriptChannelId: config.transcriptChannelId,
          transcriptWebhookUrl: config.transcriptWebhookUrl,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          configured: true,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/guilds/{guildId}/tickets/archive-config:
   *   patch:
   *     summary: Update archive configuration
   *     description: Updates or creates archive configuration for the guild
   *     tags: [Archive Config]
   *     parameters:
   *       - in: path
   *         name: guildId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               archiveCategoryId:
   *                 type: string
   *                 description: Discord category channel ID for archived tickets
   *               archiveExpireDays:
   *                 type: integer
   *                 description: Days before archived tickets are deleted
   *                 minimum: 1
   *               transcriptChannelId:
   *                 type: string
   *                 description: Channel to send transcripts to
   *               transcriptWebhookUrl:
   *                 type: string
   *                 description: Webhook URL for transcript notifications
   *     responses:
   *       200:
   *         description: Archive configuration updated
   *       400:
   *         description: Validation error
   */
  router.patch("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { archiveCategoryId, archiveExpireDays, transcriptChannelId, transcriptWebhookUrl } = req.body;

      // Validation
      if (archiveExpireDays !== undefined && archiveExpireDays < 1) {
        res.status(400).json({
          success: false,
          error: "archiveExpireDays must be at least 1",
        });
        return;
      }

      // Creating a new config requires archiveCategoryId
      let config = await TicketArchiveConfig.findOne({ guildId });

      if (!config) {
        if (!archiveCategoryId) {
          res.status(400).json({
            success: false,
            error: "archiveCategoryId is required when creating archive configuration",
          });
          return;
        }

        config = new TicketArchiveConfig({
          guildId,
          archiveCategoryId,
          archiveExpireDays: archiveExpireDays || 30,
          transcriptChannelId,
          transcriptWebhookUrl,
        });
      } else {
        // Update existing config
        if (archiveCategoryId !== undefined) config.archiveCategoryId = archiveCategoryId;
        if (archiveExpireDays !== undefined) config.archiveExpireDays = archiveExpireDays;
        if (transcriptChannelId !== undefined) config.transcriptChannelId = transcriptChannelId;
        if (transcriptWebhookUrl !== undefined) config.transcriptWebhookUrl = transcriptWebhookUrl;
      }

      await config.save();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
