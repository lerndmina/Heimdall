/**
 * Player CRUD routes
 *
 * GET    /players          — List linked players (with filters)
 * POST   /players/manual   — Staff manually link player
 * PUT    /players/:playerId — Update player
 * DELETE /players/:playerId — Revoke player link
 * DELETE /players/:playerId/permanent — Permanently delete record
 * POST   /players/:playerId/link — Manually link Discord account
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { PlanetSideApiDependencies } from "./index.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import { createLogger } from "../../../src/core/Logger.js";
import { escapeRegex } from "../../lib/utils/escapeRegex.js";

const log = createLogger("planetside:api:players");

export function createPlayersRoutes(deps: PlanetSideApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET /players — List with optional filters
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { status, search, page = "1", limit = "50" } = req.query;

      const query: Record<string, unknown> = { guildId };

      if (status === "linked") {
        query.linkedAt = { $ne: null };
        query.revokedAt = null;
      } else if (status === "pending") {
        query.linkedAt = null;
        query.revokedAt = null;
        query.verificationStatus = "pending";
      } else if (status === "revoked") {
        query.revokedAt = { $ne: null };
      } else if (status === "verified") {
        query.verifiedAt = { $ne: null };
        query.revokedAt = null;
      }

      if (search && typeof search === "string") {
        const trimmedSearch = search.trim();
        if (trimmedSearch) {
          const isDiscordSnowflake = /^\d{17,20}$/.test(trimmedSearch);

          if (isDiscordSnowflake) {
            query.discordId = trimmedSearch;
          } else {
            const escaped = escapeRegex(trimmedSearch);
            query.$or = [{ characterName: { $regex: escaped, $options: "i" } }, { discordId: { $regex: escaped, $options: "i" } }];
          }
        }
      }

      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const isAll = (limit as string).toLowerCase() === "all";
      const limitNum = isAll ? 0 : Math.max(1, parseInt(limit as string, 10) || 50);
      const skip = limitNum > 0 ? (pageNum - 1) * limitNum : 0;

      const findQuery = PlanetSidePlayer.find(query).sort({ createdAt: -1 });
      if (limitNum > 0) findQuery.skip(skip).limit(limitNum);

      const [players, total] = await Promise.all([findQuery.lean(), PlanetSidePlayer.countDocuments(query)]);

      res.json({
        success: true,
        data: {
          players,
          pagination: {
            page: limitNum > 0 ? pageNum : 1,
            limit: limitNum || total,
            total,
            pages: limitNum > 0 ? Math.ceil(total / limitNum) : 1,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/manual — Staff manually add a linked player
  router.post("/manual", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      const { characterName, characterId, discordId, factionId, serverId } = req.body;

      if (!characterName || !characterId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "characterName and characterId are required" },
        });
        return;
      }

      // Check for existing link
      const existing = await PlanetSidePlayer.findOne({
        guildId,
        characterId,
      }).lean();

      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: "Character is already linked" },
        });
        return;
      }

      const playerData: Record<string, unknown> = {
        guildId,
        characterId,
        characterName,
        factionId: factionId ?? 0,
        serverId: serverId ?? 0,
        source: "manual",
        linkedAt: new Date(),
        verifiedAt: new Date(),
        verificationStatus: "verified",
      };

      if (discordId) {
        playerData.discordId = discordId;
      }

      // Add audit trail
      playerData.auditTrail = [
        {
          action: "manual_link",
          performedBy: actorUserId,
          timestamp: new Date(),
          details: `Manually linked by staff via dashboard`,
        },
      ];

      const player = await PlanetSidePlayer.create(playerData);

      log.info(`Staff ${actorUserId} manually linked ${characterName} (${characterId}) in guild ${guildId}`);
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
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      delete updateData._id;
      delete updateData.guildId;

      const current = await PlanetSidePlayer.findOne({ _id: playerId, guildId });
      if (!current) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      // Handle status transitions
      const status = updateData.status;
      delete updateData.status;

      if (status === "revoked") {
        if (!current.revokedAt) {
          updateData.revokedAt = new Date();
          updateData.revokedBy = actorUserId;
        }
        updateData.revocationReason = updateData.revocationReason || "Revoked via dashboard";
      } else if (status === "linked") {
        updateData.revokedAt = null;
        updateData.revokedBy = null;
        updateData.revocationReason = null;
        if (!current.linkedAt) {
          updateData.linkedAt = new Date();
        }
      } else if (status === "verified") {
        updateData.verifiedAt = new Date();
        updateData.verificationStatus = "verified";
        updateData.revokedAt = null;
        updateData.revokedBy = null;
        updateData.revocationReason = null;
        if (!current.linkedAt) {
          updateData.linkedAt = new Date();
        }
      }

      const player = await PlanetSidePlayer.findOneAndUpdate({ _id: playerId, guildId }, updateData, { new: true, runValidators: true }).lean();

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

  // DELETE /players/:playerId — Revoke player link
  router.delete("/:playerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { reason } = req.body || {};
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      const player = await PlanetSidePlayer.findOne({ _id: playerId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      player.revokedAt = new Date();
      player.revokedBy = actorUserId;
      player.revocationReason = reason || "Revoked via dashboard";
      player.auditTrail.push({
        action: "revoke",
        performedBy: actorUserId,
        timestamp: new Date(),
        details: reason || "Revoked via dashboard",
      });
      await player.save();

      // Remove configured Discord roles from the member
      const discordId = typeof player.discordId === "string" ? player.discordId : null;
      if (discordId) {
        try {
          const config = await PlanetSideConfig.findOne({ guildId }).lean();
          const guild = await deps.lib.thingGetter.getGuild(guildId as string);
          if (guild && config) {
            const member = await deps.lib.thingGetter.getMember(guild, discordId);
            if (member) {
              const rolesToRemove = [config.roles?.member, config.roles?.guest].filter(Boolean) as string[];
              for (const roleId of rolesToRemove) {
                if (member.roles.cache.has(roleId)) {
                  await member.roles.remove(roleId).catch((err: Error) => {
                    log.warn(`Failed to remove role ${roleId} from ${discordId}:`, err);
                  });
                }
              }
            }
          }
        } catch (err) {
          log.warn(`Role removal failed for ${discordId} after revoke:`, err);
        }
      }

      log.info(`Staff ${actorUserId} revoked link for ${player.characterName} in guild ${guildId}`);
      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /players/:playerId/permanent — Permanently delete player record
  router.delete("/:playerId/permanent", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;

      const player = await PlanetSidePlayer.findOneAndDelete({ _id: playerId, guildId }).lean();
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Player not found" },
        });
        return;
      }

      log.info(`Permanently deleted player record: ${player.characterName} (guild: ${guildId})`);
      res.json({ success: true, data: { deleted: player.characterName } });
    } catch (error) {
      next(error);
    }
  });

  // POST /players/:playerId/link — Manually link a Discord account
  router.post("/:playerId/link", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, playerId } = req.params;
      const { discordId } = req.body || {};

      if (!discordId) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "discordId is required" },
        });
        return;
      }

      const player = await PlanetSidePlayer.findOne({ _id: playerId, guildId });
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

      // Check if this Discord user is already linked to another character in this guild
      const existingLink = await PlanetSidePlayer.findOne({
        guildId,
        discordId,
        linkedAt: { $ne: null },
        _id: { $ne: playerId },
      }).lean();

      if (existingLink) {
        res.status(409).json({
          success: false,
          error: { code: "DISCORD_ALREADY_LINKED", message: `This Discord user is already linked to ${existingLink.characterName}` },
        });
        return;
      }

      player.discordId = discordId;
      player.linkedAt = new Date();
      player.auditTrail.push({
        action: "manual_link",
        performedBy: req.header("X-User-Id") || "dashboard",
        timestamp: new Date(),
        details: `Manually linked to Discord user ${discordId}`,
      });
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
