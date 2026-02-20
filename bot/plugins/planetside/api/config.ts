/**
 * GET /api/guilds/:guildId/planetside/config
 * PUT /api/guilds/:guildId/planetside/config
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";

/**
 * Maps model field names to dashboard-friendly names for the GET response.
 */
function modelToDashboard(config: Record<string, any>): Record<string, any> {
  return {
    guildId: config.guildId,
    enabled: config.enabled ?? false,
    outfitId: config.outfitId ?? "",
    outfitTag: config.outfitTag ?? "",
    outfitName: config.outfitName ?? "",
    censusServiceId: config.censusServiceId ?? "",
    honuBaseUrl: config.honuBaseUrl ?? "https://wt.honu.pw",
    verificationMethod: config.verificationMethod ?? "online_now",
    verificationWindowMinutes: config.verificationWindowMinutes ?? 30,
    roles: {
      member: config.roles?.member ?? null,
      guest: config.roles?.guest ?? null,
      promotion: config.roles?.promotion ?? null,
    },
    channels: {
      log: config.channels?.log ?? null,
      censusStatus: config.channels?.censusStatus ?? null,
      panel: config.channels?.panel ?? null,
    },
    enableAutoRevoke: config.leaveRevocation?.enabled ?? false,
    enableAutoRestore: config.leaveRevocation?.restoreOnRejoin ?? false,
    populationSource: config.populationSource ?? "honu",
    allowSelfUnlink: config.allowSelfUnlink ?? true,
    defaultDashboardTab: config.defaultDashboardTab ?? "players",
    panel: {
      title: config.panel?.title ?? "",
      description: config.panel?.description ?? "",
      color: config.panel?.color ?? "",
      footerText: config.panel?.footerText ?? "",
      showAuthor: config.panel?.showAuthor ?? true,
      showTimestamp: config.panel?.showTimestamp ?? true,
    },
  };
}

/**
 * Maps dashboard field names back to model field names for PUT.
 */
function dashboardToModel(data: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = { ...data };

  if ("enableAutoRevoke" in mapped) {
    if (!mapped.leaveRevocation) mapped.leaveRevocation = {};
    mapped.leaveRevocation.enabled = mapped.enableAutoRevoke;
    delete mapped.enableAutoRevoke;
  }
  if ("enableAutoRestore" in mapped) {
    if (!mapped.leaveRevocation) mapped.leaveRevocation = {};
    mapped.leaveRevocation.restoreOnRejoin = mapped.enableAutoRestore;
    delete mapped.enableAutoRestore;
  }

  return mapped;
}

export function createConfigRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const config = await PlanetSideConfig.findOne({ guildId }).lean();

      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No PlanetSide configuration found" },
        });
        return;
      }

      res.json({
        success: true,
        data: modelToDashboard(config),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const updateData = req.body;

      if (!updateData || typeof updateData !== "object") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Request body must be an object" },
        });
        return;
      }

      // Prevent changing guildId
      delete updateData.guildId;
      delete updateData._id;

      // Map dashboard field names to model fields
      const modelData = dashboardToModel(updateData);

      const config = await PlanetSideConfig.findOneAndUpdate({ guildId }, { ...modelData, guildId }, { upsert: true, new: true, runValidators: true }).lean();

      res.json({
        success: true,
        data: modelToDashboard(config),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
