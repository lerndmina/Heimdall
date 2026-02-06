/**
 * Role Sync API routes
 *
 * GET  /role-sync/logs                 — View sync audit log
 * POST /players/:playerId/role-sync    — Manual sync trigger
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import { RoleSyncService } from "../services/RoleSyncService.js";

export function createRoleSyncRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET /role-sync/logs
  router.get("/role-sync/logs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const limitStr = typeof req.query.limit === "string" ? req.query.limit : "50";
      const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 50));

      const logs = await RoleSyncService.getRoleSyncLogs(guildId as string, limit);

      res.json({ success: true, data: { logs, total: logs.length } });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/role-sync — Manual sync
  router.post("/players/:playerId/role-sync", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { currentGroups } = req.body || {};

      const result = await deps.roleSyncService.calculateRoleSync(guildId as string, playerId as string, currentGroups || []);

      if (!result) {
        res.status(400).json({
          success: false,
          error: { code: "SYNC_FAILED", message: "Role sync not available for this player" },
        });
        return;
      }

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
