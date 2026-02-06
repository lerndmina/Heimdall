/**
 * DELETE /api/guilds/:guildId/tempvc/channels/:channelId
 *
 * Force-delete a temporary voice channel via API.
 *
 * @swagger
 * /api/guilds/{guildId}/tempvc/channels/{channelId}:
 *   delete:
 *     summary: Delete a temp voice channel
 *     description: Force-delete an active temporary voice channel
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: channelId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Channel deleted
 *       404:
 *         description: Channel or guild not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TempVCApiDependencies } from "./index.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";
import type { VoiceChannel } from "discord.js";

export function createChannelDeleteRoutes(deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;

      const guild = await deps.lib.thingGetter.getGuild(guildId);
      if (!guild) {
        res.status(404).json({
          success: false,
          error: { code: "GUILD_NOT_FOUND", message: "Guild not found or bot not in guild" },
        });
        return;
      }

      const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
      if (!channel) {
        res.status(404).json({
          success: false,
          error: { code: "CHANNEL_NOT_FOUND", message: "Voice channel not found" },
        });
        return;
      }

      if (!channel.isVoiceBased()) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_CHANNEL_TYPE", message: "Channel is not a voice channel" },
        });
        return;
      }

      // Verify it's tracked as a temp channel
      const activeDoc = await ActiveTempChannels.findOne({ guildId });
      if (!activeDoc?.channelIds.includes(channelId)) {
        res.status(400).json({
          success: false,
          error: { code: "NOT_TEMP_CHANNEL", message: "Channel is not a registered temporary voice channel" },
        });
        return;
      }

      const channelInfo = {
        id: channel.id,
        name: channel.name,
        memberCount: channel.members.size,
        members: Array.from(channel.members.values()).map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
        })),
      };

      try {
        await channel.delete("Forcefully deleted via API");
      } catch (discordError) {
        res.status(500).json({
          success: false,
          error: { code: "DISCORD_DELETE_FAILED", message: "Failed to delete channel from Discord" },
        });
        return;
      }

      // Remove from tracking
      activeDoc.channelIds = activeDoc.channelIds.filter((id) => id !== channelId);
      await activeDoc.save();

      res.json({
        success: true,
        data: {
          deletedChannel: channelInfo,
          message: "Temporary voice channel deleted successfully",
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
