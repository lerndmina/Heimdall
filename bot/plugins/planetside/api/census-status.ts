/**
 * GET  /api/guilds/:guildId/planetside/census-status
 * POST /api/guilds/:guildId/planetside/census-status/test
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";
import CensusStatus from "../models/CensusStatus.js";

export function createCensusStatusRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET / — Current API health status
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const status = await CensusStatus.findOne({ guildId }).lean();

      if (!status) {
        res.json({
          success: true,
          data: {
            guildId,
            census: { online: null, lastChecked: null, consecutiveFailures: 0, consecutiveSuccesses: 0 },
            honu: { online: null, lastChecked: null, consecutiveFailures: 0, consecutiveSuccesses: 0 },
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId: status.guildId,
          census: {
            online: status.census?.online ?? null,
            lastChecked: status.census?.lastChecked ?? null,
            lastChange: status.census?.lastChange ?? null,
            consecutiveFailures: status.census?.consecutiveFailures ?? 0,
            consecutiveSuccesses: status.census?.consecutiveSuccesses ?? 0,
          },
          honu: {
            online: status.honu?.online ?? null,
            lastChecked: status.honu?.lastChecked ?? null,
            lastChange: status.honu?.lastChange ?? null,
            consecutiveFailures: status.honu?.consecutiveFailures ?? 0,
            consecutiveSuccesses: status.honu?.consecutiveSuccesses ?? 0,
          },
          fisu: {
            online: (status as any).fisu?.online ?? null,
            lastChecked: (status as any).fisu?.lastChecked ?? null,
            lastChange: (status as any).fisu?.lastChange ?? null,
            consecutiveFailures: (status as any).fisu?.consecutiveFailures ?? 0,
            consecutiveSuccesses: (status as any).fisu?.consecutiveSuccesses ?? 0,
          },
          statusMessageId: status.statusMessageId,
          statusChannelId: status.statusChannelId,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /start — Start the census monitor for this guild (triggers immediate poll)
  router.post("/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      deps.censusMonitorService.startForGuild(guildId as string);
      res.json({ success: true, data: { message: "Census monitor started" } });
    } catch (error) {
      next(error);
    }
  });

  // POST /test — Test API connectivity
  router.post("/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results: Record<string, any> = {};

      // Test Honu
      try {
        const health = await deps.apiService.getHonuHealth();
        results.honu = { online: true, responseTime: health ? "OK" : "degraded" };
      } catch {
        results.honu = { online: false, error: "Connection failed" };
      }

      // Test Census
      try {
        const censusOk = await deps.apiService.testCensusConnection();
        results.census = { online: censusOk };
      } catch {
        results.census = { online: false, error: "Connection failed" };
      }

      // Test Fisu
      try {
        const fisuData = await deps.apiService.fisuGetPopulation();
        results.fisu = { online: Array.isArray(fisuData) && fisuData.length > 0 };
      } catch {
        results.fisu = { online: false, error: "Connection failed" };
      }

      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
