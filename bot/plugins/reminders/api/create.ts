/**
 * POST /api/guilds/:guildId/reminders
 *
 * Create a new reminder.
 *
 * @swagger
 * /api/guilds/{guildId}/reminders:
 *   post:
 *     summary: Create a new reminder
 *     description: Create a reminder for the specified user in the guild
 *     tags: [Reminders]
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
 *             required: [userId, channelId, message, triggerAt]
 *             properties:
 *               userId:
 *                 type: string
 *               channelId:
 *                 type: string
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *               triggerAt:
 *                 type: string
 *                 format: date-time
 *                 description: ISO 8601 date string
 *               guildName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Reminder created
 *       400:
 *         description: Invalid input or limit reached
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RemindersApiDependencies } from "./index.js";

export function createReminderCreateRoutes(deps: RemindersApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { userId, channelId, message, triggerAt, guildName } = req.body;

      if (!userId || !channelId || !message || !triggerAt) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "userId, channelId, message, and triggerAt are required" },
        });
        return;
      }

      const triggerDate = new Date(triggerAt);
      if (isNaN(triggerDate.getTime())) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "triggerAt must be a valid ISO 8601 date" },
        });
        return;
      }

      if (triggerDate <= new Date()) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "triggerAt must be in the future" },
        });
        return;
      }

      if (typeof message !== "string" || message.length > 1000) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "message must be a string of 1000 characters or less" },
        });
        return;
      }

      const reminder = await deps.reminderService.createReminder({
        userId,
        guildId,
        channelId,
        message,
        triggerAt: triggerDate,
        guildName,
      });

      res.status(201).json({ success: true, data: reminder });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Maximum")) {
        res.status(400).json({
          success: false,
          error: { code: "LIMIT_REACHED", message: error.message },
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
