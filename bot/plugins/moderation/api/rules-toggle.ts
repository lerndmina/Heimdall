/**
 * PATCH /api/guilds/:guildId/moderation/rules/:ruleId/toggle
 *
 * Toggle an automod rule on/off.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createRulesToggleRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.patch("/:ruleId/toggle", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ruleId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "enabled must be a boolean" },
        });
        return;
      }

      const rule = await deps.moderationService.toggleRule(guildId as string, ruleId as string, enabled);

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
