/**
 * Whitelist request management routes
 *
 * GET   /pending                — List pending requests
 * POST  /approve/:authId        — Approve a request
 * POST  /reject/:authId         — Reject a request
 * POST  /bulk-approve           — Approve multiple requests
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";

export function createRequestsRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // GET /pending — List all pending whitelist requests
  router.get("/pending", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const pending = await MinecraftPlayer.find({
        guildId,
        linkedAt: { $ne: null },
        whitelistedAt: null,
        revokedAt: null,
      })
        .sort({ linkedAt: 1 })
        .lean();

      res.json({ success: true, data: { requests: pending, total: pending.length } });
    } catch (error) {
      next(error);
    }
  });

  // POST /approve/:authId — Approve a whitelist request
  router.post("/approve/:authId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, authId } = req.params;
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      const player = await MinecraftPlayer.findOne({ _id: authId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Request not found" },
        });
        return;
      }

      if (player.whitelistedAt) {
        res.status(400).json({
          success: false,
          error: { code: "ALREADY_APPROVED", message: "Player is already whitelisted" },
        });
        return;
      }

      player.whitelistedAt = new Date();
      player.approvedBy = actorUserId;
      player.authCode = undefined;
      player.expiresAt = undefined;
      player.confirmedAt = new Date();
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /reject/:authId — Reject a whitelist request
  router.post("/reject/:authId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, authId } = req.params;
      const { reason } = req.body || {};
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      const player = await MinecraftPlayer.findOne({ _id: authId, guildId });
      if (!player) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Request not found" },
        });
        return;
      }

      player.rejectionReason = reason || "Rejected by staff";
      player.revokedAt = new Date();
      player.revokedBy = actorUserId;
      player.authCode = undefined;
      player.expiresAt = undefined;
      await player.save();

      res.json({ success: true, data: player.toObject() });
    } catch (error) {
      next(error);
    }
  });

  // POST /bulk-approve — Approve multiple requests
  router.post("/bulk-approve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { playerIds } = req.body;
      const actorUserId = req.header("X-User-Id");

      if (!actorUserId) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "playerIds array is required" },
        });
        return;
      }

      const result = await MinecraftPlayer.updateMany(
        { _id: { $in: playerIds }, guildId, whitelistedAt: null },
        {
          whitelistedAt: new Date(),
          approvedBy: actorUserId,
          confirmedAt: new Date(),
          $unset: { authCode: 1, expiresAt: 1 },
        },
      );

      res.json({
        success: true,
        data: { approved: result.modifiedCount, requested: playerIds.length },
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /bulk-revert — Undo bulk approvals (returns players to pending)
  router.post("/bulk-revert", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { playerIds } = req.body;

      if (!Array.isArray(playerIds) || playerIds.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "playerIds array is required" },
        });
        return;
      }

      const result = await MinecraftPlayer.updateMany(
        { _id: { $in: playerIds }, guildId, whitelistedAt: { $ne: null } },
        {
          $unset: { whitelistedAt: 1, approvedBy: 1, confirmedAt: 1 },
        },
      );

      res.json({
        success: true,
        data: { reverted: result.modifiedCount, requested: playerIds.length },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
