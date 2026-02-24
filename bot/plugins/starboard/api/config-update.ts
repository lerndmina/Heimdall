import { Router, type NextFunction, type Request, type Response } from "express";
import type { StarboardApiDependencies } from "./index.js";

export function createConfigUpdateRoutes(deps: StarboardApiDependencies): Router {
  const router = Router({ mergeParams: true });

  const normalizeBoardId = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  router.put("/boards", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { board } = req.body as { board?: Record<string, unknown> };

      if (!board || typeof board !== "object") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "board object is required" },
        });
        return;
      }

      const channelId = typeof board.channelId === "string" ? board.channelId.trim() : "";
      const emoji = typeof board.emoji === "string" ? board.emoji.trim() : "";

      if (!channelId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "board.channelId is required" },
        });
        return;
      }

      if (!emoji) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "board.emoji is required" },
        });
        return;
      }

      const config = await deps.starboardService.upsertBoard(guildId, {
        boardId: normalizeBoardId(board.boardId),
        name: typeof board.name === "string" ? board.name : "Starboard",
        emoji,
        channelId,
        threshold: typeof board.threshold === "number" ? board.threshold : 3,
        enabled: typeof board.enabled === "boolean" ? board.enabled : true,
        selfStar: typeof board.selfStar === "boolean" ? board.selfStar : false,
        removeOnUnreact: typeof board.removeOnUnreact === "boolean" ? board.removeOnUnreact : true,
        ignoredChannelIds: Array.isArray(board.ignoredChannelIds) ? (board.ignoredChannelIds.filter((v): v is string => typeof v === "string") as string[]) : [],
        ignoredRoleIds: Array.isArray(board.ignoredRoleIds) ? (board.ignoredRoleIds.filter((v): v is string => typeof v === "string") as string[]) : [],
        requiredRoleIds: Array.isArray(board.requiredRoleIds) ? (board.requiredRoleIds.filter((v): v is string => typeof v === "string") as string[]) : [],
        allowNSFW: typeof board.allowNSFW === "boolean" ? board.allowNSFW : false,
        postAsEmbed: typeof board.postAsEmbed === "boolean" ? board.postAsEmbed : true,
        maxMessageAgeDays: typeof board.maxMessageAgeDays === "number" ? board.maxMessageAgeDays : 0,
        autoLockThreshold: typeof board.autoLockThreshold === "number" ? board.autoLockThreshold : 0,
        moderationEnabled: typeof board.moderationEnabled === "boolean" ? board.moderationEnabled : false,
        moderationChannelId: typeof board.moderationChannelId === "string" ? board.moderationChannelId : null,
      });

      res.json({ success: true, data: { guildId, boards: config.boards } });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/boards/:boardId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const boardId = req.params.boardId as string;

      const removed = await deps.starboardService.removeBoard(guildId, boardId);
      if (!removed) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Board not found" },
        });
        return;
      }

      res.json({ success: true, data: { removed: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
