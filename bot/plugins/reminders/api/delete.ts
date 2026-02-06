/**
 * DELETE /api/guilds/:guildId/reminders/:reminderId
 *
 * Delete (cancel) a reminder.
 *
 * @swagger
 * /api/guilds/{guildId}/reminders/{reminderId}:
 *   delete:
 *     summary: Delete a reminder
 *     description: Cancel and permanently delete a reminder
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
 *         description: Reminder deleted
 *       400:
 *         description: Missing userId parameter
 *       404:
 *         description: Reminder not found or already triggered
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { RemindersApiDependencies } from "./index.js";

export function createReminderDeleteRoutes(deps: RemindersApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:reminderId", async (req: Request, res: Response, next: NextFunction) => {
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

      const deleted = await deps.reminderService.cancelReminder(reminderId as string, userId);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Reminder not found or already triggered" },
        });
        return;
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
