/**
 * GET /api/guilds/:guildId/attachment-blocker/config
 *
 * Get the guild-wide attachment blocker configuration.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";

export function createConfigGetRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const config = await deps.service.getGuildConfig(guildId);
      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No attachment blocker configured for this guild" },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
