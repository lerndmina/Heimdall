/**
 * PUT /api/guilds/:guildId/tempvc/config
 * DELETE /api/guilds/:guildId/tempvc/config
 *
 * Update or delete the TempVC configuration for a guild.
 *
 * @swagger
 * /api/guilds/{guildId}/tempvc/config:
 *   put:
 *     summary: Update TempVC configuration
 *     description: Replace the creator channel configuration for the guild
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channels:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     channelId:
 *                       type: string
 *                     categoryId:
 *                       type: string
 *                     useSequentialNames:
 *                       type: boolean
 *                     channelName:
 *                       type: string
 *     responses:
 *       200:
 *         description: Updated configuration
 *   delete:
 *     summary: Delete TempVC configuration
 *     description: Remove all TempVC configuration for the guild
 *     tags: [TempVC]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuration deleted
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TempVCApiDependencies } from "./index.js";
import TempVC from "../models/TempVC.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";
import { MAX_TEMPVC_CHANNELS } from "../../../src/core/DashboardLimits.js";

export function createConfigUpdateRoutes(_deps: TempVCApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // PUT — replace entire channel configuration
  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { channels } = req.body;

      if (!Array.isArray(channels)) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "channels must be an array" },
        });
        return;
      }

      if (channels.length > MAX_TEMPVC_CHANNELS) {
        res.status(400).json({
          success: false,
          error: { code: "LIMIT_REACHED", message: `Cannot have more than ${MAX_TEMPVC_CHANNELS} creator channels` },
        });
        return;
      }

      // Validate each channel entry
      for (const ch of channels) {
        if (!ch.channelId || !ch.categoryId) {
          res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "Each channel must have channelId and categoryId" },
          });
          return;
        }
      }

      // Check for duplicates
      const channelIds = channels.map((c: any) => c.channelId);
      if (new Set(channelIds).size !== channelIds.length) {
        res.status(400).json({
          success: false,
          error: { code: "DUPLICATE_CHANNELS", message: "Duplicate channel IDs are not allowed" },
        });
        return;
      }

      const updatedConfig = await TempVC.findOneAndUpdate(
        { guildId },
        {
          guildId,
          channels: channels.map((ch: any) => ({
            channelId: ch.channelId,
            categoryId: ch.categoryId,
            useSequentialNames: ch.useSequentialNames ?? false,
            channelName: ch.channelName || "Temp VC",
            permissionMode: ch.permissionMode ?? "none",
            roleOverrides: (ch.roleOverrides ?? []).map((ro: any) => ({
              roleId: ro.roleId,
              view: ro.view ?? "neutral",
              connect: ro.connect ?? "neutral",
            })),
            sendInviteDM: ch.sendInviteDM ?? false,
          })),
          updatedAt: new Date(),
        },
        { new: true, upsert: true, runValidators: true },
      );

      res.json({
        success: true,
        data: {
          guildId: updatedConfig.guildId,
          channels: (updatedConfig.channels || []).map((ch) => ({
            channelId: ch.channelId,
            categoryId: ch.categoryId,
            useSequentialNames: ch.useSequentialNames ?? false,
            channelName: ch.channelName || "Temp VC",
            permissionMode: (ch as any).permissionMode ?? "none",
            roleOverrides: ((ch as any).roleOverrides ?? []).map((ro: any) => ({
              roleId: ro.roleId,
              view: ro.view ?? "neutral",
              connect: ro.connect ?? "neutral",
            })),
            sendInviteDM: (ch as any).sendInviteDM ?? false,
          })),
          createdAt: updatedConfig.createdAt.toISOString(),
          updatedAt: updatedConfig.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // DELETE — remove all config and active channel tracking
  router.delete("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;

      const existing = await TempVC.findOne({ guildId });
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No temp VC configuration found for this guild" },
        });
        return;
      }

      await TempVC.deleteOne({ guildId });
      await ActiveTempChannels.deleteOne({ guildId });

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
