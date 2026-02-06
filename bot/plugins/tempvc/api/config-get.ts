/**
 * GET /api/guilds/:guildId/tempvc/config
 *
 * Returns the TempVC configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/tempvc/config:
 *   get:
 *     summary: Get TempVC configuration
 *     description: Returns creator channel configuration for the guild
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: TempVC configuration
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TempVCApiDependencies } from "./index.js";
import TempVC from "../models/TempVC.js";

export function createConfigRoutes(_deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const config = await TempVC.findOne({ guildId }).lean();

      if (!config) {
        res.json({
          success: true,
          data: {
            guildId,
            channels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId: config.guildId,
          channels: (config.channels || []).map((ch) => ({
            channelId: ch.channelId,
            categoryId: ch.categoryId,
            useSequentialNames: ch.useSequentialNames ?? false,
            channelName: ch.channelName || "Temp VC",
          })),
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
