/**
 * Server status routes
 *
 * GET    /status           — List all monitored servers for a guild
 * POST   /status           — Add a new monitored server
 * DELETE /status/:serverId — Remove a monitored server
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import McServerStatus from "../models/McServerStatus.js";
import { pingMcServer } from "../utils/mcstatus-utils.js";

export function createStatusRoutes(_deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET /status — List all monitored servers
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const servers = await McServerStatus.find({ guildId }).lean();

      res.json({
        success: true,
        data: { servers, total: servers.length },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /status — Add a new monitored server
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { serverName, serverIp, serverPort = 25565 } = req.body;

      // Validate required fields
      if (!serverName || !serverIp) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION", message: "serverName and serverIp are required" },
        });
        return;
      }

      // Validate port
      if (serverPort < 1 || serverPort > 65535) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION", message: "Port must be between 1 and 65535" },
        });
        return;
      }

      // Check duplicate
      const existing = await McServerStatus.findOne({ id: serverName.toLowerCase(), guildId });
      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "DUPLICATE", message: "A server with that name already exists in this guild" },
        });
        return;
      }

      // Ping to verify reachable
      try {
        await pingMcServer({ serverIp, serverPort, serverName });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(422).json({
          success: false,
          error: { code: "UNREACHABLE", message: msg },
        });
        return;
      }

      const server = await McServerStatus.findOneAndUpdate({ id: serverName.toLowerCase() }, { id: serverName.toLowerCase(), guildId, serverIp, serverPort, serverName }, { upsert: true, new: true });

      res.status(201).json({ success: true, data: { server: server.toObject() } });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /status/:serverId — Remove a monitored server
  router.delete("/:serverId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, serverId } = req.params;

      const server = await McServerStatus.findOneAndDelete({ id: serverId, guildId });
      if (!server) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Server not found" },
        });
        return;
      }

      res.json({ success: true, data: { deleted: server.serverName } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
