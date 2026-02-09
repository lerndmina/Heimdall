/**
 * Channel Lock API Routes
 *
 * GET    /locks          — List all locked channels in the guild
 * GET    /locks/:channelId — Get lock details for a specific channel
 * POST   /locks/:channelId/unlock — Unlock a channel via dashboard
 * GET    /locks/config   — Get lock bypass role configuration
 * PUT    /locks/config   — Update lock bypass roles
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import type { ChannelLockService } from "../services/ChannelLockService.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import { ChannelType, type TextChannel, type NewsChannel } from "discord.js";

export interface LockApiDeps extends ModerationApiDeps {
  channelLockService: ChannelLockService;
  client: HeimdallClient;
}

export function createLockRoutes(deps: LockApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /locks/config — Get lock bypass role configuration
   */
  router.get("/config", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const config = await deps.moderationService.getOrCreateConfig(guildId);

      res.json({
        success: true,
        data: {
          lockBypassRoles: (config as any).lockBypassRoles ?? [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /locks/config — Update lock bypass roles
   */
  router.put("/config", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { lockBypassRoles } = req.body;

      if (!Array.isArray(lockBypassRoles)) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "lockBypassRoles must be an array of role ID strings" },
        });
        return;
      }

      // Validate all entries are strings
      if (!lockBypassRoles.every((id: unknown) => typeof id === "string")) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "All role IDs must be strings" },
        });
        return;
      }

      const config = await deps.moderationService.updateConfig(guildId, { lockBypassRoles } as any);
      if (!config) {
        res.status(500).json({
          success: false,
          error: { code: "UPDATE_FAILED", message: "Failed to update lock bypass roles" },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          lockBypassRoles: (config as any).lockBypassRoles ?? [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /locks — List all locked channels in the guild
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const locks = await deps.channelLockService.getGuildLocks(guildId);

      // Enrich with channel names if the guild is available
      const guild = deps.client.guilds.cache.get(guildId);
      const enriched = locks.map((lock) => {
        const channel = guild?.channels.cache.get(lock.channelId);
        return {
          ...lock,
          channelName: channel?.name ?? "Unknown",
        };
      });

      res.json({ success: true, data: enriched });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /locks/:channelId — Get lock details for a specific channel
   */
  router.get("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channelId } = req.params;
      const lock = await deps.channelLockService.getLock(channelId as string);

      if (!lock) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Channel is not locked" },
        });
        return;
      }

      res.json({ success: true, data: lock });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /locks/:channelId/unlock — Unlock a channel via dashboard
   */
  router.post("/:channelId/unlock", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;

      const guild = deps.client.guilds.cache.get(guildId);
      if (!guild) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Guild not available" },
        });
        return;
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Text channel not found" },
        });
        return;
      }

      const result = await deps.channelLockService.unlockChannel(
        channel as TextChannel | NewsChannel,
        undefined, // No moderator for dashboard unlocks
      );

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: { code: "UNLOCK_FAILED", message: result.error },
        });
        return;
      }

      res.json({ success: true, data: { message: "Channel unlocked successfully" } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
