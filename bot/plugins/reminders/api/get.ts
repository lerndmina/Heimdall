/**
 * GET /api/guilds/:guildId/reminders/:reminderId
 *
 * Get a single reminder by ID.
 *
 * @swagger
 * /api/guilds/{guildId}/reminders/{reminderId}:
 *   get:
 *     summary: Get a single reminder
 *     description: Retrieve a specific reminder by its ID
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
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Discord user ID (ownership check)
 *     responses:
 *       200:
 *         description: Reminder details
 *       400:
 *         description: Missing userId parameter
 *       404:
 *         description: Reminder not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RemindersApiDependencies } from "./index.js";

export function createReminderGetRoutes(deps: RemindersApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/:reminderId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reminderId } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "userId query parameter is required" },
        });
        return;
      }

      const reminder = await deps.reminderService.getReminder(reminderId as string, userId);
      if (!reminder) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Reminder not found" },
        });
        return;
      }

      res.json({ success: true, data: reminder });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
