/**
 * DELETE /api/guilds/:guildId/logging/config
 *
 * Delete all logging configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/logging/config:
 *   delete:
 *     summary: Delete logging configuration
 *     description: Remove all logging configuration for a guild
 *     tags: [Logging]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Config deleted
 *       404:
 *         description: No config found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { LoggingApiDependencies } from "./index.js";

export function createConfigDeleteRoutes(deps: LoggingApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const deleted = await deps.loggingService.deleteConfig(guildId);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No logging configuration found" },
        });
        return;
      }

      res.json({ success: true, data: { message: "Logging configuration deleted" } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
