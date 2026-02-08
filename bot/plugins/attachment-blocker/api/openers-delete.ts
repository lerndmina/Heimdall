/**
 * DELETE /api/guilds/:guildId/attachment-blocker/openers/:openerChannelId
 *
 * Delete an opener-based attachment blocker override.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AttachmentBlockerApiDependencies } from "./index.js";

export function createOpenersDeleteRoutes(deps: AttachmentBlockerApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:openerChannelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const openerChannelId = req.params.openerChannelId as string;
      const deleted = await deps.service.deleteOpenerConfig(openerChannelId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No opener override found for that channel" },
        });
        return;
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
