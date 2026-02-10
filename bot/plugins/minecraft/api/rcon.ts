/**
 * POST /api/guilds/:guildId/minecraft/test-rcon
 *
 * Test RCON connection to the Minecraft server.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig, { decryptRconPassword } from "../models/MinecraftConfig.js";
import { RconService } from "../services/RconService.js";

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

      // Resolve RCON password (encrypted or legacy plaintext)
      let rconPassword: string | undefined;
      if (config.encryptedRconPassword) {
        try { rconPassword = decryptRconPassword(config.encryptedRconPassword); } catch { /* ignore */ }
      } else if (config.rconPassword) {
        rconPassword = config.rconPassword;
      }

      if (!rconPassword) {
        res.status(400).json({
          success: false,
          error: { code: "NOT_CONFIGURED", message: "RCON password is not set" },
        });
        return;
      }

      const conn = {
        host: config.rconHost || config.serverHost || "localhost",
        port: config.rconPort || 25575,
        password: rconPassword,
      };

      const result = await RconService.testConnection(conn);

      res.json({
        success: result.success,
        data: {
          message: result.message,
          host: conn.host,
          port: conn.port,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
