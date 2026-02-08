/**
 * GET /api/dev/bot-owner - Check if current user is the bot owner
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DevApiDependencies } from "./index.js";

export function createBotOwnerRoutes(deps: DevApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      const ownerIds = (process.env.OWNER_IDS || "").trim().split(",").filter(Boolean);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Not authenticated",
          },
        });
        return;
      }

      const isBotOwner = ownerIds.includes(userId);

      res.json({
        success: true,
        data: {
          isBotOwner,
          userId,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
