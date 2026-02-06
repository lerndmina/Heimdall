/**
 * POST /api/guilds/:guildId/minecraft/test-rcon
 *
 * Test RCON connection to the Minecraft server (placeholder).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";

export function createRconRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/test-rcon", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.enabled || !config.rconEnabled) {
        res.status(400).json({
          success: false,
          error: { code: "NOT_CONFIGURED", message: "RCON is not enabled" },
        });
        return;
      }

      // RCON test is a placeholder — actual implementation requires a
      // Minecraft RCON library and network connectivity to the MC server.
      res.json({
        success: true,
        data: {
          message: "RCON test is not yet implemented. Check server connectivity manually.",
          host: config.rconHost,
          port: config.rconPort,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
