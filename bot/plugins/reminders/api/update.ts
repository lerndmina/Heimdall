/**
 * PUT /api/guilds/:guildId/reminders/:reminderId
 *
 * Update an existing reminder.
 *
 * @swagger
 * /api/guilds/{guildId}/reminders/{reminderId}:
 *   put:
 *     summary: Update a reminder
 *     description: Update the message and/or trigger time of a reminder
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: reminderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The Discord user ID (ownership check)
 *               message:
 *                 type: string
 *                 maxLength: 1000
 *               triggerAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Reminder updated
 *       400:
 *         description: Invalid input or already triggered
 *       404:
 *         description: Reminder not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RemindersApiDependencies } from "./index.js";

export function createReminderUpdateRoutes(deps: RemindersApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.put("/:reminderId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reminderId } = req.params;
      const { userId, message, triggerAt } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "userId is required" },
        });
        return;
      }

      const updates: { message?: string; triggerAt?: Date } = {};

      if (message !== undefined) {
        if (typeof message !== "string" || message.length > 1000) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "message must be a string of 1000 characters or less" },
          });
          return;
        }
        updates.message = message;
      }

      if (triggerAt !== undefined) {
        const triggerDate = new Date(triggerAt);
        if (isNaN(triggerDate.getTime())) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "triggerAt must be a valid ISO 8601 date" },
          });
          return;
        }
        updates.triggerAt = triggerDate;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "At least one of message or triggerAt must be provided" },
        });
        return;
      }

      const updated = await deps.reminderService.updateReminder(reminderId as string, userId, updates);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Reminder not found" },
        });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("triggered")) {
          res.status(400).json({
            success: false,
            error: { code: "ALREADY_TRIGGERED", message: error.message },
          });
          return;
        }
        if (error.message.includes("future")) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: error.message },
          });
          return;
        }
      }
      next(error);
    }
  });

  return router;
}
