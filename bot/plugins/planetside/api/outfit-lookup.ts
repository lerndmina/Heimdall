/**
 * GET /api/guilds/:guildId/planetside/outfit-lookup?tag=KOTV
 *
 * Looks up an outfit by tag via Honu and returns its details.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";

export function createOutfitLookupRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tag = (req.query.tag as string)?.trim();

      if (!tag) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Query parameter 'tag' is required" },
        });
        return;
      }

      const outfits = await deps.apiService.getOutfitByTag(tag);
      if (!outfits || outfits.length === 0) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `No outfit found with tag [${tag.toUpperCase()}]` },
        });
        return;
      }

      const outfit = outfits[0]!;

      res.json({
        success: true,
        data: {
          id: outfit.id,
          name: outfit.name,
          tag: outfit.tag,
          factionID: outfit.factionID,
          worldID: outfit.worldID,
          memberCount: outfit.memberCount ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
