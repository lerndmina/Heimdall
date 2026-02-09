/**
 * GET /api/guilds/:guildId/moderation/infractions
 * GET /api/guilds/:guildId/moderation/infractions/:userId
 * DELETE /api/guilds/:guildId/moderation/infractions/:userId
 *
 * Infraction listing and management.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

/** Resolve userIds to display names via the Discord client. Best-effort, falls back to raw ID. */
async function enrichInfractions(deps: ModerationApiDeps, guildId: string, infractions: any[]): Promise<any[]> {
  const userIds = new Set<string>();
  for (const inf of infractions) {
    if (inf.userId) userIds.add(inf.userId);
    if (inf.moderatorId) userIds.add(inf.moderatorId);
  }

  const nameMap = new Map<string, { username: string; displayName: string }>();
  const guild = await deps.lib.thingGetter.getGuild(guildId);

  await Promise.allSettled(
    [...userIds].map(async (id) => {
      try {
        if (guild) {
          const member = await deps.lib.thingGetter.getMember(guild, id);
          if (member) {
            nameMap.set(id, { username: member.user.username, displayName: member.displayName });
            return;
          }
        }
        const user = await deps.lib.thingGetter.getUser(id);
        if (user) nameMap.set(id, { username: user.username, displayName: user.displayName });
      } catch {
        // Ignore — will fall back to raw ID
      }
    }),
  );

  return infractions.map((inf) => {
    const userInfo = nameMap.get(inf.userId);
    const modInfo = inf.moderatorId ? nameMap.get(inf.moderatorId) : null;
    return {
      ...inf,
      userUsername: userInfo?.username ?? null,
      userDisplayName: userInfo?.displayName ?? null,
      moderatorUsername: modInfo?.username ?? null,
      moderatorDisplayName: modInfo?.displayName ?? null,
    };
  });
}

export function createInfractionsRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET / — List all infractions (paginated), optionally filtered by userId
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const userId = req.query.userId as string | undefined;
      const source = req.query.source as string | undefined;
      const type = req.query.type as string | undefined;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);

      const result = await deps.infractionService.getUserInfractions(guildId, userId ?? "", {
        page,
        limit,
        source: source as any,
        type: type as any,
      });

      const enriched = await enrichInfractions(deps, guildId, result.infractions);
      res.json({ success: true, data: { ...result, infractions: enriched } });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /:userId — Get infractions for a specific user
   */
  router.get("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, userId } = req.params;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const source = req.query.source as string | undefined;
      const type = req.query.type as string | undefined;

      const result = await deps.infractionService.getUserInfractions(guildId as string, userId as string, { page, limit, source: source as any, type: type as any });

      const activePoints = await deps.infractionService.getActivePoints(guildId as string, userId as string);

      const enriched = await enrichInfractions(deps, guildId as string, result.infractions);

      res.json({
        success: true,
        data: {
          ...result,
          infractions: enriched,
          activePoints,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /:userId — Clear all active infractions for a user
   */
  router.delete("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, userId } = req.params;
      const cleared = await deps.infractionService.clearUserInfractions(guildId as string, userId as string);

      res.json({
        success: true,
        data: { cleared },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
