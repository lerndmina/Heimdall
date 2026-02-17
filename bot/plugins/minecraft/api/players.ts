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
import { mapOldToNew, type OldPlayerDoc } from "../lib/whitelistImport.js";
import { escapeRegex } from "../../lib/utils/escapeRegex.js";

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
        query.revokedAt = null;
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
        const trimmedSearch = search.trim();
        if (trimmedSearch) {
          const isDiscordSnowflake = /^\d{17,20}$/.test(trimmedSearch);

          if (isDiscordSnowflake) {
            query.discordId = trimmedSearch;
          } else {
            const escaped = escapeRegex(trimmedSearch);
            query.$or = [
              { minecraftUsername: { $regex: escaped, $options: "i" } },
              { discordUsername: { $regex: escaped, $options: "i" } },
              { discordDisplayName: { $regex: escaped, $options: "i" } },
              { discordId: { $regex: escaped, $options: "i" } },
            ];
          }
        }
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      // "all" = no limit
      const isAll = (limit as string).toLowerCase() === "all";
      const limitNum = isAll ? 0 : Math.max(1, parseInt(limit as string, 10) || 50);
      const skip = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

      const findQuery = MinecraftPlayer.find(query).sort({ createdAt: -1 });
      if (limitNum > 0) findQuery.skip(skip).limit(limitNum);

      const [players, total] = await Promise.all([findQuery.lean(), MinecraftPlayer.countDocuments(query)]);

      res.json({
        success: true,
        data: {
          players,
          pagination: { page: limitNum > 0 ? pageNum : 1, limit: limitNum || total, total, pages: limitNum > 0 ? Math.ceil(total / limitNum) : 1 },
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
      const actorUserId = req.header("X-User-Id") || "api";
      const { minecraftUsername, minecraftUuid, discordId, discordUsername, discordDisplayName, notes, status, rejectionReason, revocationReason } = req.body;

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
        minecraftUsername: { $regex: new RegExp(`^${escapeRegex(minecraftUsername)}$`, "i") },
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
      if (discordId) {
        playerData.discordId = discordId;
        playerData.linkedAt = new Date();
      }
      if (discordUsername) playerData.discordUsername = discordUsername;
      if (discordDisplayName) playerData.discordDisplayName = discordDisplayName;

      // Handle status
      const resolvedStatus = status || "pending";
      if (resolvedStatus === "whitelisted") {
        playerData.whitelistedAt = new Date();
        if (!playerData.linkedAt) playerData.linkedAt = new Date();
        playerData.approvedBy = actorUserId;
      } else if (resolvedStatus === "revoked") {
        playerData.revokedAt = new Date();
        playerData.revokedBy = actorUserId;
        if (revocationReason) playerData.revocationReason = revocationReason;
      }
      // "pending" is the default — linkedAt set, no whitelistedAt
      if (resolvedStatus === "pending" && !playerData.linkedAt) {
        playerData.linkedAt = new Date();
      }

      if (rejectionReason) playerData.rejectionReason = rejectionReason;

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
      const actorUserId = req.header("X-User-Id") || "api";

      delete updateData._id;
      delete updateData.guildId;

      // Translate the virtual `status` field into the real DB fields
      const status = updateData.status;
      delete updateData.status;

      const current = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!current) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      if (status === "revoked") {
        // Only set revokedAt if not already revoked
        if (!current.revokedAt) {
          updateData.revokedAt = new Date();
          updateData.revokedBy = actorUserId;
        }
        updateData.revocationReason = updateData.revocationReason || current.revocationReason || "Revoked via dashboard";
        // Clear whitelist status
        updateData.whitelistedAt = null;
        updateData.approvedBy = null;
      } else if (status === "whitelisted") {
        // Only set whitelistedAt if not already whitelisted
        if (!current.whitelistedAt) {
          updateData.whitelistedAt = new Date();
          updateData.approvedBy = actorUserId;
        }
        // Clear revocation status
        updateData.revokedAt = null;
        updateData.revokedBy = null;
        updateData.revocationReason = null;
        // Ensure linkedAt is set
        if (!current.linkedAt && (updateData.discordId || current.discordId)) {
          updateData.linkedAt = new Date();
        }
      } else if (status === "pending") {
        // Clear both whitelist and revocation — back to pending
        updateData.whitelistedAt = null;
        updateData.approvedBy = null;
        updateData.revokedAt = null;
        updateData.revokedBy = null;
        updateData.revocationReason = null;
        // Ensure linkedAt is set
        if (!current.linkedAt) {
          updateData.linkedAt = new Date();
        }
      } else {
        // No status field — handle linkedAt auto-set for legacy callers
        if (updateData.discordId || updateData.status === "whitelisted") {
          const hasDiscord = updateData.discordId || current.discordId;
          const isWhitelisted = updateData.whitelistedAt || current.whitelistedAt;
          const hasLinked = updateData.linkedAt || current.linkedAt;
          if (hasDiscord && isWhitelisted && !hasLinked) {
            updateData.linkedAt = new Date();
          }
        }
      }

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
      const actorUserId = req.header("X-User-Id") || "api";

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.revokedAt = new Date();
      player.revokedBy = actorUserId;
      player.revocationReason = reason || "Removed via API";
      // Clear auth/linking data
      player.authCode = undefined;
      player.expiresAt = undefined;
      player.codeShownAt = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /players/:playerId/permanent — Permanently delete player record
  router.delete("/:playerId/permanent", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;

      const player = await MinecraftPlayer.findOneAndDelete({ _id: playerId, guildId }).lean();
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      log.info(`Permanently deleted player record: ${player.minecraftUsername} (guild: ${guildId})`);
      res.json({ success: true, data: { deleted: player.minecraftUsername } });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/whitelist — Whitelist player
  router.post("/:playerId/whitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { approvedBy } = req.body || {};
      const actorUserId = req.header("X-User-Id") || approvedBy || "api";

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.whitelistedAt = new Date();
      player.approvedBy = actorUserId;
      player.revokedAt = undefined;
      player.revokedBy = undefined;
      player.revocationReason = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/unwhitelist — Remove whitelist (back to pending, not revoked)
  router.post("/:playerId/unwhitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;

      const player = await MinecraftPlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      // Clear whitelist status but keep them linked (back to pending)
      player.whitelistedAt = undefined;
      player.approvedBy = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // NOTE: reject endpoint removed — revoke now handles both cases (clears auth data too)

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

  // POST /import-whitelist — Bulk import with SSE progress (mounted at parent router level)
  router.post("/import-whitelist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { players: playerList, mode = "skip", stream } = req.body;

      if (!Array.isArray(playerList) || playerList.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "players array is required and must not be empty" },
        });
        return;
      }

      const overwrite = mode === "overwrite";

      const results = { imported: 0, skipped: 0, overwritten: 0, errors: 0 };

      const mapEntry = (entry: unknown) => {
        if (typeof entry === "string") {
          return {
            username: entry,
            doc: {
              guildId,
              minecraftUsername: entry,
              whitelistedAt: new Date(),
              source: "imported",
            },
          };
        }

        if (!entry || typeof entry !== "object") return null;

        const e = entry as Record<string, unknown>;
        const username = (e.minecraftUsername as string) || (e.name as string) || (e.username as string);
        const uuid = (e.minecraftUuid as string) || (e.uuid as string);

        if (!username) return null;

        const hasHeimdallFields = Boolean(
          e.minecraftUsername || e.discordId || e.linkedAt || e.whitelistedAt || e.revokedAt || e.discordUsername || e.discordDisplayName || e.whitelistStatus || e.createdAt || e.updatedAt,
        );

        if (!hasHeimdallFields && (e.name || e.username)) {
          return {
            username,
            doc: {
              guildId,
              minecraftUsername: username,
              minecraftUuid: uuid,
              whitelistedAt: new Date(),
              source: "imported",
            },
          };
        }

        const mapped = mapOldToNew(e as OldPlayerDoc, guildId as string);

        if (uuid && !mapped.minecraftUuid) mapped.minecraftUuid = uuid;

        const whitelistStatus = typeof e.whitelistStatus === "string" ? e.whitelistStatus : "";
        if (whitelistStatus === "whitelisted" && !mapped.whitelistedAt) {
          mapped.whitelistedAt = new Date();
        }
        if (whitelistStatus === "revoked" && !mapped.revokedAt) {
          mapped.revokedAt = new Date();
        }

        return { username, doc: mapped };
      };

      // If the client asks for SSE streaming, send progress events
      const useStream = stream === true;
      if (useStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
      }

      const total = playerList.length;
      let processed = 0;

      // Send progress every N records (or at least every 1% / every 50 records)
      const progressInterval = Math.max(1, Math.min(50, Math.floor(total / 100)));

      for (const entry of playerList) {
        try {
          const mapped = mapEntry(entry);
          if (!mapped) {
            results.errors++;
            processed++;
            continue;
          }

          const existing = await MinecraftPlayer.findOne({
            guildId,
            minecraftUsername: { $regex: new RegExp(`^${mapped.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          });

          if (existing) {
            if (overwrite) {
              // Overwrite: update the existing record with all mapped fields except guildId
              const updateData = { ...mapped.doc };
              delete updateData.guildId;
              await MinecraftPlayer.updateOne({ _id: existing._id }, { $set: updateData });
              results.overwritten++;
            } else {
              results.skipped++;
            }
          } else {
            await MinecraftPlayer.create(mapped.doc);
            results.imported++;
          }
        } catch {
          results.errors++;
        }

        processed++;

        if (useStream && (processed % progressInterval === 0 || processed === total)) {
          res.write(`data: ${JSON.stringify({ processed, total, ...results })}\n\n`);
        }
      }

      if (useStream) {
        res.write(`data: ${JSON.stringify({ done: true, processed, total, ...results })}\n\n`);
        res.end();
      } else {
        res.json({ success: true, data: results });
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
}
