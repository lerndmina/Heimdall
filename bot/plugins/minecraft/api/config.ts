/**
 * GET /api/guilds/:guildId/minecraft/config
 * PUT /api/guilds/:guildId/minecraft/config
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";

export function createConfigRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const config = await MinecraftConfig.findOne({ guildId }).lean();

      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No Minecraft configuration found" },
        });
        return;
      }

      // Strip sensitive RCON password
      const { rconPassword, ...safeConfig } = config;

      res.json({
        success: true,
        data: { ...safeConfig, rconPassword: rconPassword ? "***" : null },
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

      const config = await MinecraftConfig.findOneAndUpdate({ guildId }, { ...updateData, guildId }, { upsert: true, new: true, runValidators: true }).lean();

      const { rconPassword, ...safeConfig } = config;

      res.json({
        success: true,
        data: { ...safeConfig, rconPassword: rconPassword ? "***" : null },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
