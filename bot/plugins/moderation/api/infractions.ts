/**
 * GET /api/guilds/:guildId/moderation/infractions
 * GET /api/guilds/:guildId/moderation/infractions/:userId
 * DELETE /api/guilds/:guildId/moderation/infractions/:userId
 *
 * Infraction listing and management.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createInfractionsRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET / — List all infractions (paginated), optionally filtered by userId
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const userId = req.query.userId as string | undefined;
      const source = req.query.source as string | undefined;
      const type = req.query.type as string | undefined;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);

      const result = await deps.infractionService.getUserInfractions(guildId, userId ?? "", {
        page,
        limit,
        source: source as any,
        type: type as any,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /:userId — Get infractions for a specific user
   */
  router.get("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, userId } = req.params;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const source = req.query.source as string | undefined;
      const type = req.query.type as string | undefined;

      const result = await deps.infractionService.getUserInfractions(guildId as string, userId as string, { page, limit, source: source as any, type: type as any });

      const activePoints = await deps.infractionService.getActivePoints(guildId as string, userId as string);

      res.json({
        success: true,
        data: {
          ...result,
          activePoints,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /:userId — Clear all active infractions for a user
   */
  router.delete("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, userId } = req.params;
      const cleared = await deps.infractionService.clearUserInfractions(guildId as string, userId as string);

      res.json({
        success: true,
        data: { cleared },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
