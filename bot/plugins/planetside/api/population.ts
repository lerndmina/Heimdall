/**
 * GET /api/guilds/:guildId/planetside/population
 * GET /api/guilds/:guildId/planetside/population/:worldId
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";
import { WORLD_NAMES, type HonuWorldPopulation } from "../services/PlanetSideApiService.js";

// ── Normalization (worldID → worldId for dashboard) ──────────

interface NormalizedPopulation {
  worldId: number;
  worldName: string;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
  total: number;
}

function normalizePopulation(raw: HonuWorldPopulation[]): NormalizedPopulation[] {
  return raw.map((w) => ({
    worldId: w.worldID,
    worldName: w.worldName || WORLD_NAMES[w.worldID] || `World ${w.worldID}`,
    vs: w.vs,
    nc: w.nc,
    tr: w.tr,
    ns: w.ns,
    total: w.total || w.vs + w.nc + w.tr + (w.ns || 0),
  }));
}

export function createPopulationRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET / — All worlds population (service-level cache handles TTL)
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = await deps.apiService.getPopulation();
      if (!raw) {
        res.json({ success: true, data: null });
        return;
      }

      res.json({ success: true, data: normalizePopulation(raw) });
    } catch (error) {
      next(error);
    }
  });

  // GET /:worldId — Specific world population
  router.get("/:worldId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const worldId = parseInt(req.params.worldId as string, 10);
      if (isNaN(worldId)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "worldId must be a number" },
        });
        return;
      }

      // Try the cached all-worlds data first (avoids a separate API call)
      const allPop = await deps.apiService.getPopulation();
      if (allPop) {
        const match = allPop.find((w) => w.worldID === worldId);
        if (match) {
          res.json({
            success: true,
            data: {
              world: {
                worldId: match.worldID,
                worldName: match.worldName || WORLD_NAMES[match.worldID] || `World ${match.worldID}`,
                vs: match.vs,
                nc: match.nc,
                tr: match.tr,
                ns: match.ns,
                total: match.total || match.vs + match.nc + match.tr + (match.ns || 0),
              },
            },
          });
          return;
        }
      }

      // Fallback: fetch single world directly
      const worldPop = await deps.apiService.getWorldPopulation(worldId);
      const normalized = worldPop
        ? {
            worldId: worldPop.worldID,
            worldName: worldPop.worldName || WORLD_NAMES[worldPop.worldID] || `World ${worldPop.worldID}`,
            vs: worldPop.vs,
            nc: worldPop.nc,
            tr: worldPop.tr,
            ns: worldPop.ns,
            total: worldPop.total || worldPop.vs + worldPop.nc + worldPop.tr + (worldPop.ns || 0),
          }
        : null;

      res.json({
        success: true,
        data: { world: normalized },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
