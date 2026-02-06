/**
 * GET /api/guilds/:guildId/tempvc/stats
 *
 * Returns statistics about temporary voice channels in the guild.
 *
 * @swagger
 * /api/guilds/{guildId}/tempvc/stats:
 *   get:
 *     summary: Get TempVC statistics
 *     description: Returns active channel count, average lifetime, and per-channel details
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: TempVC statistics
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { PermissionFlagsBits } from "discord.js";
import type { TempVCApiDependencies } from "./index.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";

export function createStatsRoutes(deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const activeDoc = await ActiveTempChannels.findOne({ guildId }).lean();
      if (!activeDoc || !activeDoc.channelIds.length) {
        res.json({
          success: true,
          data: { active: 0, totalCreated: 0, averageLifetimeMinutes: null, activeChannels: [] },
        });
        return;
      }

      const guild = await deps.lib.thingGetter.getGuild(guildId as string);
      if (!guild) {
        res.status(404).json({
          success: false,
          error: { code: "GUILD_NOT_FOUND", message: "Guild not found or bot not in guild" },
        });
        return;
      }

      const now = new Date();
      const channelsWithAge: Array<{
        channelId: string;
        ownerId: string;
        createdAt: string;
        ageMinutes: number;
      }> = [];

      for (const channelId of activeDoc.channelIds) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (!channel?.isVoiceBased()) continue;

          const createdAt = channel.createdAt || now;
          const ageMinutes = Math.floor((now.getTime() - createdAt.getTime()) / 1000 / 60);

          // Determine owner by looking for ManageChannels permission override
          let ownerId = "Unknown";
          for (const [userId, overwrite] of channel.permissionOverwrites.cache) {
            if (overwrite.type === 1 && overwrite.allow.has(PermissionFlagsBits.ManageChannels)) {
              ownerId = userId;
              break;
            }
          }

          channelsWithAge.push({
            channelId: channel.id,
            ownerId,
            createdAt: createdAt.toISOString(),
            ageMinutes,
          });
        } catch {
          // Channel may have been deleted
          continue;
        }
      }

      const avgLifetime = channelsWithAge.length > 0 ? channelsWithAge.reduce((sum, ch) => sum + ch.ageMinutes, 0) / channelsWithAge.length : null;

      res.json({
        success: true,
        data: {
          active: channelsWithAge.length,
          totalCreated: activeDoc.channelIds.length,
          averageLifetimeMinutes: avgLifetime,
          activeChannels: channelsWithAge.sort((a, b) => b.ageMinutes - a.ageMinutes),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
