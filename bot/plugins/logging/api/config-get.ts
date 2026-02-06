/**
 * GET /api/guilds/:guildId/logging/config
 *
 * Get logging configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/logging/config:
 *   get:
 *     summary: Get logging configuration
 *     description: Retrieve the logging configuration for a guild, including all categories and subcategories
 *     tags: [Logging]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Discord guild ID
 *     responses:
 *       200:
 *         description: Logging config retrieved
 *       404:
 *         description: No logging configured
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { LoggingApiDependencies } from "./index.js";

export function createConfigGetRoutes(deps: LoggingApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const config = await deps.loggingService.getConfig(guildId);
      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No logging configured for this guild" },
        });
        return;
      }

      // Convert Map to plain object for JSON serialization
      const serialized = {
        ...config,
        categories: config.categories.map((cat) => ({
          category: cat.category,
          channelId: cat.channelId,
          enabled: cat.enabled,
          subcategories: cat.subcategories instanceof Map ? Object.fromEntries(cat.subcategories) : cat.subcategories,
        })),
      };

      res.json({ success: true, data: serialized });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
