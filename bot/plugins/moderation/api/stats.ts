/**
 * GET /api/guilds/:guildId/moderation/stats
 *
 * Guild-wide moderation statistics for the dashboard overview.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

export function createStatsRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const [stats, config, rules] = await Promise.all([deps.infractionService.getGuildStats(guildId), deps.moderationService.getOrCreateConfig(guildId), deps.moderationService.listRules(guildId)]);

      const enabledRules = rules.filter((r) => r.enabled);

      res.json({
        success: true,
        data: {
          ...stats,
          automodEnabled: config.automodEnabled,
          totalRules: rules.length,
          enabledRules: enabledRules.length,
          escalationTiers: config.escalationTiers?.length ?? 0,
          pointDecayEnabled: config.pointDecayEnabled,
          pointDecayDays: config.pointDecayDays,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
