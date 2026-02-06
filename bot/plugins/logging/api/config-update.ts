/**
 * PUT /api/guilds/:guildId/logging/config
 *
 * Update logging configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/logging/config:
 *   put:
 *     summary: Update logging configuration
 *     description: Update category setup, channel assignment, or subcategory toggles
 *     tags: [Logging]
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
 *               category:
 *                 type: string
 *                 enum: [messages, users, moderation]
 *               channelId:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               subcategories:
 *                 type: object
 *                 additionalProperties:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Config updated
 *       400:
 *         description: Invalid input
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { LoggingApiDependencies } from "./index.js";
import { LoggingCategory } from "../models/LoggingConfig.js";

export function createConfigUpdateRoutes(deps: LoggingApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { category, channelId, enabled, subcategories } = req.body;

      if (!category || !Object.values(LoggingCategory).includes(category)) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "Valid category is required (messages, users, moderation)" },
        });
        return;
      }

      // Setup / update channel
      if (channelId) {
        const result = await deps.loggingService.setupCategory(guildId, category, channelId);
        if (!result.success) {
          res.status(400).json({
            success: false,
            error: { code: "SETUP_FAILED", message: result.error },
          });
          return;
        }
      }

      // Toggle enabled state
      if (typeof enabled === "boolean") {
        if (enabled) {
          await deps.loggingService.setupCategory(guildId, category, channelId);
        } else {
          await deps.loggingService.disableCategory(guildId, category);
        }
      }

      // Toggle subcategories
      if (subcategories && typeof subcategories === "object") {
        for (const [subcat, value] of Object.entries(subcategories)) {
          if (typeof value === "boolean") {
            await deps.loggingService.toggleSubcategory(guildId, category, subcat, value);
          }
        }
      }

      const config = await deps.loggingService.getConfig(guildId);
      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
