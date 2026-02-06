/**
 * Player CRUD routes
 *
 * GET    /players          — List players (with filters)
 * POST   /players/manual   — Staff manually add player
 * PUT    /players/:playerId — Update player
 * DELETE /players/:playerId — Revoke player
 * POST   /players/:playerId/whitelist   — Whitelist player
 * POST   /players/:playerId/unwhitelist — Remove whitelist
 * POST   /import-whitelist              — Bulk import
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:api:players");

export function createPlayersRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET /players — List with optional filters
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { status, search, page = "1", limit = "50" } = req.query;

      const query: Record<string, unknown> = { guildId };

      if (status === "whitelisted") {
        query.whitelistedAt = { $ne: null };
        query.revokedAt = null;
      } else if (status === "pending") {
        query.linkedAt = { $ne: null };
        query.whitelistedAt = null;
      } else if (status === "revoked") {
        query.revokedAt = { $ne: null };
      } else if (status === "unlinked") {
        query.discordId = null;
      } else if (status === "linked") {
        query.discordId = { $ne: null };
        query.linkedAt = { $ne: null };
      } else if (status === "unconfirmed") {
        query.authCode = { $ne: null };
        query.confirmedAt = null;
        query.linkedAt = null;
      }

      if (search && typeof search === "string") {
        query.$or = [{ minecraftUsername: { $regex: search, $options: "i" } }, { discordUsername: { $regex: search, $options: "i" } }, { discordDisplayName: { $regex: search, $options: "i" } }];
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [players, total] = await Promise.all([MinecraftPlayer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(), MinecraftPlayer.countDocuments(query)]);

      res.json({
        success: true,
        data: {
          players,
          pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/manual — Staff manually add a player
  router.post("/manual", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { minecraftUsername, minecraftUuid, discordId, notes, whitelist } = req.body;

      if (!minecraftUsername) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "minecraftUsername is required" },
        });
        return;
      }

      // Check for existing
      const existing = await MinecraftPlayer.findOne({
        guildId,
        minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
      }).lean();

      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: "Player already exists" },
        });
        return;
      }

      const playerData: Record<string, unknown> = {
        guildId,
        minecraftUsername,
        source: "manual",
        notes,
      };

      if (minecraftUuid) playerData.minecraftUuid = minecraftUuid;
      if (discordId) playerData.discordId = discordId;
      if (whitelist) {
        playerData.whitelistedAt = new Date();
        playerData.linkedAt = new Date();
        playerData.approvedBy = "api";
      }

      const player = await MinecraftPlayer.create(playerData);

      res.status(201).json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // PUT /players/:playerId — Update player
  router.put("/:playerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const updateData = req.body;

      delete updateData._id;
      delete updateData.guildId;

      const player = await MinecraftPlayer.findOneAndUpdate({ _id: playerId, guildId }, updateData, { new: true, runValidators: true }).lean();

      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      res.json({ success: true, data: player });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /players/:playerId — Revoke / remove player
  router.delete("/:playerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { reason } = req.body || {};

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.revokedAt = new Date();
      player.revokedBy = "api";
      player.revocationReason = reason || "Removed via API";
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/whitelist — Whitelist player
  router.post("/:playerId/whitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { approvedBy } = req.body || {};

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.whitelistedAt = new Date();
      player.approvedBy = approvedBy || "api";
      player.revokedAt = undefined;
      player.revokedBy = undefined;
      player.revocationReason = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/unwhitelist — Remove whitelist
  router.post("/:playerId/unwhitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { reason, revokedBy } = req.body || {};

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.revokedAt = new Date();
      player.revokedBy = revokedBy || "api";
      player.revocationReason = reason || "Unwhitelisted via API";
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/reject — Reject a whitelist application
  router.post("/:playerId/reject", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { reason, rejectedBy } = req.body || {};

      if (!reason) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "reason is required" },
        });
        return;
      }

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.rejectionReason = reason;
      player.revokedAt = new Date();
      player.revokedBy = rejectedBy || "api";
      player.revocationReason = reason;
      // Clear auth data
      player.authCode = undefined;
      player.expiresAt = undefined;
      player.codeShownAt = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/link — Manually link a Discord account to a Minecraft player
  router.post("/:playerId/link", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { discordId, discordUsername, discordDisplayName } = req.body || {};

      if (!discordId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "discordId is required" },
        });
        return;
      }

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      if (player.discordId && player.linkedAt) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_LINKED", message: "Player is already linked to a Discord account" },
        });
        return;
      }

      // Check if this Discord user is already linked to another MC account in this guild
      const existingLink = await MinecraftPlayer.findOne({
        guildId,
        discordId,
        linkedAt: { $ne: null },
        _id: { $ne: playerId },
      }).lean();

      if (existingLink) {
        res.status(409).json({
          success: false,
          error: { code: "DISCORD_ALREADY_LINKED", message: `This Discord user is already linked to ${existingLink.minecraftUsername}` },
        });
        return;
      }

      player.discordId = discordId;
      player.linkedAt = new Date();
      if (discordUsername) player.discordUsername = discordUsername;
      if (discordDisplayName) player.discordDisplayName = discordDisplayName;
      // Clear any pending auth
      player.authCode = undefined;
      player.expiresAt = undefined;
      player.codeShownAt = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /import-whitelist — Bulk import
  router.post("/../import-whitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { players: playerList, format } = req.body;

      if (!Array.isArray(playerList) || playerList.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "players array is required and must not be empty" },
        });
        return;
      }

      const results = { imported: 0, skipped: 0, errors: 0 };

      for (const entry of playerList) {
        try {
          const username = typeof entry === "string" ? entry : entry.name || entry.username;
          const uuid = typeof entry === "string" ? undefined : entry.uuid;

          if (!username) {
            results.errors++;
            continue;
          }

          const existing = await MinecraftPlayer.findOne({
            guildId,
            minecraftUsername: { $regex: new RegExp(`^${username}$`, "i") },
          }).lean();

          if (existing) {
            results.skipped++;
            continue;
          }

          await MinecraftPlayer.create({
            guildId,
            minecraftUsername: username,
            minecraftUuid: uuid,
            whitelistedAt: new Date(),
            source: "imported",
          });
          results.imported++;
        } catch {
          results.errors++;
        }
      }

      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
