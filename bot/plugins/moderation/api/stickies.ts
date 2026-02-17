/**
 * Sticky Message API Routes
 *
 * GET    /stickies           — List all sticky messages in the guild
 * GET    /stickies/:channelId — Get sticky details for a channel
 * PUT    /stickies/:channelId — Create or update a sticky message
 * DELETE /stickies/:channelId — Remove a sticky message
 * PATCH  /stickies/:channelId/toggle — Enable/disable a sticky
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import type { StickyMessageService } from "../services/StickyMessageService.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

export interface StickyApiDeps extends ModerationApiDeps {
  stickyMessageService: StickyMessageService;
  client: HeimdallClient;
}

export function createStickyRoutes(deps: StickyApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /stickies — List all sticky messages in the guild
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const stickies = await deps.stickyMessageService.getGuildStickies(guildId);

      // Enrich with channel names
      const guild = deps.client.guilds.cache.get(guildId);
      const enriched = stickies.map((s) => {
        const channel = guild?.channels.cache.get(s.channelId);
        return {
          ...s,
          channelName: channel?.name ?? "Unknown",
        };
      });

      res.json({ success: true, data: enriched });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /stickies/:channelId — Get sticky details for a specific channel
   */
  router.get("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const channelId = req.params.channelId as string;
      const sticky = await deps.stickyMessageService.getSticky(channelId);

      if (!sticky) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No sticky message in this channel" },
        });
        return;
      }

      // Enrich with channel name
      const guild = deps.client.guilds.cache.get(req.params.guildId as string);
      const channel = guild?.channels.cache.get(channelId);

      res.json({
        success: true,
        data: { ...sticky, channelName: channel?.name ?? "Unknown" },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /stickies/:channelId — Create or update a sticky message
   */
  router.put("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;
      const { content, color, detectionBehavior, detectionDelay, conversationDuration, conversationDeleteBehavior, sendOrder } = req.body;
      const modId = req.header("X-User-Id");

      if (!modId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      if (!content || typeof content !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "content is required and must be a string" },
        });
        return;
      }

      if (content.length > 2000) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "content must be 2000 characters or less" },
        });
        return;
      }

      const sticky = await deps.stickyMessageService.setSticky(guildId, channelId, content, modId, {
        color: typeof color === "number" ? color : 0,
        detectionBehavior: detectionBehavior ?? undefined,
        detectionDelay: typeof detectionDelay === "number" ? detectionDelay : undefined,
        conversationDuration: typeof conversationDuration === "number" ? conversationDuration : undefined,
        conversationDeleteBehavior: conversationDeleteBehavior ?? undefined,
        sendOrder: typeof sendOrder === "number" ? sendOrder : undefined,
      });

      broadcastDashboardChange(guildId, "moderation", "sticky_updated", {
        requiredAction: "moderation.manage_config",
      });

      res.json({ success: true, data: sticky });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /stickies/:channelId — Remove a sticky message
   */
  router.delete("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;

      const removed = await deps.stickyMessageService.removeSticky(channelId);
      if (!removed) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No sticky message in this channel" },
        });
        return;
      }

      broadcastDashboardChange(guildId, "moderation", "sticky_updated", {
        requiredAction: "moderation.manage_config",
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /stickies/:channelId/toggle — Enable/disable a sticky message
   */
  router.patch("/:channelId/toggle", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const channelId = req.params.channelId as string;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "enabled must be a boolean" },
        });
        return;
      }

      const sticky = await deps.stickyMessageService.toggleSticky(channelId, enabled);
      if (!sticky) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No sticky message in this channel" },
        });
        return;
      }

      broadcastDashboardChange(guildId, "moderation", "sticky_updated", {
        requiredAction: "moderation.manage_config",
      });

      res.json({ success: true, data: sticky });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
