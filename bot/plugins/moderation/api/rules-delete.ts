/**
 * DELETE /api/guilds/:guildId/moderation/rules/:ruleId
 *
 * Delete an automod rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createRulesDeleteRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:ruleId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ruleId } = req.params;
      const deleted = await deps.moderationService.deleteRule(guildId as string, ruleId as string);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Rule not found" },
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
