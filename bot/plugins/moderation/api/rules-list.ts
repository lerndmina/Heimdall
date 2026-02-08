/**
 * GET /api/guilds/:guildId/moderation/rules
 *
 * List all automod rules for a guild.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createRulesListRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const enabledOnly = req.query.enabled === "true";

      const rules = enabledOnly ? await deps.moderationService.getEnabledRules(guildId) : await deps.moderationService.listRules(guildId);

      res.json({ success: true, data: { rules, total: rules.length } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
