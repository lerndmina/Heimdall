/**
 * GET /api/guilds/:guildId/attachment-blocker/openers
 *
 * List all opener-based attachment blocker overrides for a guild.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";

export function createOpenersGetRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const openers = await deps.service.getOpenerConfigs(guildId);
      res.json({ success: true, data: openers });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
