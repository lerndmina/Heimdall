/**
 * GET /api/guilds/:guildId/attachment-blocker/channels
 *
 * Get all per-channel attachment blocker overrides for a guild.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";

export function createChannelsGetRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const channels = await deps.service.getChannelConfigs(guildId);
      res.json({ success: true, data: channels });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
