import { Router, type NextFunction, type Request, type Response } from "express";
import type { StarboardApiDependencies } from "./index.js";

export function createEntriesRoutes(deps: StarboardApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const boardId = typeof req.query.boardId === "string" ? req.query.boardId : undefined;
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

      const entries = await deps.starboardService.getEntries(guildId, {
        status,
        boardId,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
      });

      res.json({ success: true, data: { entries } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:boardId/:sourceMessageId/approve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const boardId = req.params.boardId as string;
      const sourceMessageId = req.params.sourceMessageId as string;
      const moderatorId = typeof req.body?.moderatorId === "string" ? req.body.moderatorId : "dashboard";

      const result = await deps.starboardService.approvePendingEntry(guildId, boardId, sourceMessageId, moderatorId);
      if (!result.ok) {
        res.status(400).json({ success: false, error: { code: "APPROVE_FAILED", message: result.error } });
        return;
      }

      res.json({ success: true, data: { approved: true } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:boardId/:sourceMessageId/deny", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const boardId = req.params.boardId as string;
      const sourceMessageId = req.params.sourceMessageId as string;
      const moderatorId = typeof req.body?.moderatorId === "string" ? req.body.moderatorId : "dashboard";

      const result = await deps.starboardService.denyPendingEntry(guildId, boardId, sourceMessageId, moderatorId);
      if (!result.ok) {
        res.status(400).json({ success: false, error: { code: "DENY_FAILED", message: result.error } });
        return;
      }

      res.json({ success: true, data: { denied: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
