/**
 * GET /api/guilds/:guildId/planetside/population
 * GET /api/guilds/:guildId/planetside/population/:worldId
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";

export function createPopulationRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET / — All worlds population overview
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const populationData = await deps.apiService.getPopulation();

      res.json({
        success: true,
        data: populationData,
      });
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

      const worldPop = await deps.apiService.getWorldPopulation(worldId);

      res.json({
        success: true,
        data: {
          world: worldPop,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
