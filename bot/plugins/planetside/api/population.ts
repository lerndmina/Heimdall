/**
 * GET /api/guilds/:guildId/planetside/population
 * GET /api/guilds/:guildId/planetside/population/:worldId
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";
import { WORLD_NAMES, type HonuWorldPopulation } from "../services/PlanetSideApiService.js";

// ── In-memory cache (60 s TTL) ──────────────────────────────
interface PopulationCache {
  data: NormalizedPopulation[];
  expiresAt: number;
}

interface NormalizedPopulation {
  worldId: number;
  worldName: string;
  vs: number;
  nc: number;
  tr: number;
  ns: number;
  total: number;
}

const CACHE_TTL_MS = 60_000;
let populationCache: PopulationCache | null = null;

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

  // GET / — All worlds population overview (cached 60 s)
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Serve from cache if fresh
      if (populationCache && Date.now() < populationCache.expiresAt) {
        res.json({ success: true, data: populationCache.data });
        return;
      }

      const raw = await deps.apiService.getPopulation();
      if (!raw) {
        res.json({ success: true, data: null });
        return;
      }

      const normalized = normalizePopulation(raw);
      populationCache = { data: normalized, expiresAt: Date.now() + CACHE_TTL_MS };

      res.json({ success: true, data: normalized });
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

      // Try cached data first
      if (populationCache && Date.now() < populationCache.expiresAt) {
        const cached = populationCache.data.find((w) => w.worldId === worldId);
        if (cached) {
          res.json({ success: true, data: { world: cached } });
          return;
        }
      }

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
