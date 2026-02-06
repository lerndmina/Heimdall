/**
 * GET /api/guilds/:guildId/tempvc/active
 *
 * List currently active temporary voice channels.
 * Optionally include detailed channel info (members, limits, etc.).
 *
 * @swagger
 * /api/guilds/{guildId}/tempvc/active:
 *   get:
 *     summary: List active temp channels
 *     description: Returns all active temporary voice channels for the guild
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeDetails
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "false"
 *     responses:
 *       200:
 *         description: Active channels list
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TempVCApiDependencies } from "./index.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";
import type { VoiceChannel } from "discord.js";

export function createActiveListRoutes(deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const includeDetails = req.query.includeDetails === "true";

      const activeDoc = await ActiveTempChannels.findOne({ guildId }).lean();
      if (!activeDoc || !activeDoc.channelIds.length) {
        res.json({
          success: true,
          data: { guildId, channels: [], totalChannels: 0, updatedAt: new Date().toISOString() },
        });
        return;
      }

      if (!includeDetails) {
        res.json({
          success: true,
          data: {
            guildId,
            channels: activeDoc.channelIds.map((id) => ({ channelId: id })),
            totalChannels: activeDoc.channelIds.length,
            updatedAt: activeDoc.updatedAt.toISOString(),
          },
        });
        return;
      }

      // Detailed mode — resolve channel info from Discord cache
      const guild = await deps.lib.thingGetter.getGuild(guildId as string);
      if (!guild) {
        res.status(404).json({
          success: false,
          error: { code: "GUILD_NOT_FOUND", message: "Guild not found or bot not in guild" },
        });
        return;
      }

      const detailedChannels = [];
      for (const channelId of activeDoc.channelIds) {
        const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
        if (!channel || !channel.isVoiceBased()) continue;

        const members = Array.from(channel.members.values()).map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          avatar: m.user.avatarURL(),
        }));

        detailedChannels.push({
          channelId: channel.id,
          name: channel.name,
          memberCount: channel.members.size,
          userLimit: channel.userLimit || 0,
          bitrate: channel.bitrate || 64000,
          categoryId: channel.parentId,
          createdAt: channel.createdAt?.toISOString() || new Date().toISOString(),
          members,
        });
      }

      res.json({
        success: true,
        data: {
          guildId,
          channels: detailedChannels,
          totalChannels: detailedChannels.length,
          updatedAt: activeDoc.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
