/**
 * POST /api/guilds/:guildId/minecraft/request-link-code
 *
 * Called by the Java plugin when a player runs /linkdiscord in Minecraft.
 * Creates a pending auth with a 6-digit code.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:api:link");

export function createLinkRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/request-link-code", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { username, uuid } = req.body;

      if (!username || !uuid) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "username and uuid are required" } });
        return;
      }

      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.enabled) {
        res.status(404).json({ success: false, error: { code: "NOT_CONFIGURED", message: "Minecraft integration not enabled" } });
        return;
      }

      // Check if already linked
      const existingLinked = await MinecraftPlayer.findOne({
        guildId,
        minecraftUuid: uuid,
        linkedAt: { $ne: null },
      }).lean();

      if (existingLinked) {
        res.json({
          success: true,
          data: {
            alreadyLinked: true,
            message: "Your account is already linked to a Discord account",
          },
        });
        return;
      }

      // Find or create player record
      let player = await MinecraftPlayer.findOne({ guildId, minecraftUuid: uuid });

      if (!player) {
        player = new MinecraftPlayer({
          guildId,
          minecraftUuid: uuid,
          minecraftUsername: username,
          source: "linked",
        });
      }

      // Generate auth code
      let authCode = "";
      for (let i = 0; i < 10; i++) {
        authCode = Math.floor(100000 + Math.random() * 900000).toString();
        const exists = await MinecraftPlayer.exists({ authCode });
        if (!exists) break;
      }

      const expiresAt = new Date(Date.now() + (config.authCodeExpiry || 300) * 1000);

      player.authCode = authCode;
      player.expiresAt = expiresAt;
      player.codeShownAt = new Date();
      player.minecraftUsername = username;
      await player.save();

      res.json({
        success: true,
        data: {
          alreadyLinked: false,
          code: authCode,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
