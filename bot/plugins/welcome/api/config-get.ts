/**
 * GET /api/guilds/:guildId/welcome/config
 *
 * Returns the welcome message configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/config:
 *   get:
 *     summary: Get welcome message configuration
 *     description: Returns channel, message template, and available variables
 *     tags: [Welcome]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Welcome message configuration
 *       404:
 *         description: No configuration found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createConfigGetRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const config = await deps.welcomeService.getConfig(guildId);

      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No welcome message configuration found for this guild" },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId: config.guildId,
          channelId: config.channelId,
          message: config.message,
          createdAt: config.createdAt.toISOString(),
          updatedAt: config.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
