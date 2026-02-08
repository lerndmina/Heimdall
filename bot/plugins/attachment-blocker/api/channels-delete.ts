/**
 * DELETE /api/guilds/:guildId/attachment-blocker/channels/:channelId
 *
 * Remove a per-channel attachment blocker override.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";

export function createChannelsDeleteRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:channelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const channelId = req.params.channelId as string;

      const deleted = await deps.service.deleteChannelConfig(channelId);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No channel override found" },
        });
        return;
      }

      res.json({ success: true, data: { message: "Channel override deleted" } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
