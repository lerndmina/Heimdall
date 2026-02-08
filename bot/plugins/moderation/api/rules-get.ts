/**
 * GET /api/guilds/:guildId/moderation/rules/:ruleId
 *
 * Get a single automod rule by ID.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createRulesGetRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/:ruleId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ruleId } = req.params;
      const rule = await deps.moderationService.getRule(guildId as string, ruleId as string);

      if (!rule) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Rule not found" },
        });
        return;
      }

      res.json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
