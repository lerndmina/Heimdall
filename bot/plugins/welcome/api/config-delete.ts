/**
 * DELETE /api/guilds/:guildId/welcome/config
 *
 * Remove the welcome message configuration.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/config:
 *   delete:
 *     summary: Delete welcome message configuration
 *     description: Remove the welcome message for a guild
 *     tags: [Welcome]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuration deleted
 *       404:
 *         description: No configuration found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createConfigDeleteRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const result = await deps.welcomeService.deleteConfig(guildId);

      if (!result.deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No welcome message configuration found for this guild" },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId,
          deletedAt: new Date().toISOString(),
          previousConfig: result.previous,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
