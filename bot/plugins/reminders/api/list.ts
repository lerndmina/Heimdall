/**
 * GET /api/guilds/:guildId/reminders
 *
 * List reminders for a user within a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/reminders:
 *   get:
 *     summary: List reminders for a user
 *     description: Returns paginated list of reminders for the specified user in the guild
 *     tags: [Reminders]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Discord user ID
 *       - in: query
 *         name: includeTriggered
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to include already-triggered reminders
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [triggerAt, createdAt]
 *           default: triggerAt
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list of reminders
 *       400:
 *         description: Missing userId parameter
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RemindersApiDependencies } from "./index.js";

export function createReminderListRoutes(deps: RemindersApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "userId query parameter is required" },
        });
        return;
      }

      const includeTriggered = req.query.includeTriggered === "true";
      const sort = (req.query.sort as "triggerAt" | "createdAt") || "triggerAt";
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const offset = Number(req.query.offset) || 0;

      const result = await deps.reminderService.getUserReminders(userId, {
        includeTriggered,
        sort,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          reminders: result.reminders,
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
