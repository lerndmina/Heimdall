/**
 * GET/PUT /api/guilds/:guildId/moderation/config
 *
 * Read and update guild moderation configuration.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";

/**
 * Parse a human-readable duration string into milliseconds.
 * Supports: 30s, 5m, 1h, 1d, 2w — or raw ms numbers.
 */
function parseDuration(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return input;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already a plain number (ms)
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)$/i);
  if (!match || !match[1] || !match[2]) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return Math.round(value * (multipliers[unit] ?? 1));
}

export function createConfigRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /config — Get guild moderation config
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const config = await deps.moderationService.getOrCreateConfig(guildId);

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /config — Update guild moderation config
   */
  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { automodEnabled, logChannelId, pointDecayEnabled, pointDecayDays, dmOnInfraction, defaultDmTemplate, defaultDmEmbed, dmMode, immuneRoles, escalationTiers } = req.body;

      const updates: Record<string, any> = {};
      if (automodEnabled !== undefined) updates.automodEnabled = automodEnabled;
      if (logChannelId !== undefined) updates.logChannelId = logChannelId;
      if (pointDecayEnabled !== undefined) updates.pointDecayEnabled = pointDecayEnabled;
      if (pointDecayDays !== undefined) updates.pointDecayDays = pointDecayDays;
      if (dmOnInfraction !== undefined) updates.dmOnInfraction = dmOnInfraction;
      if (defaultDmTemplate !== undefined) updates.defaultDmTemplate = defaultDmTemplate;
      if (defaultDmEmbed !== undefined) updates.defaultDmEmbed = defaultDmEmbed;
      if (dmMode !== undefined) updates.dmMode = dmMode;
      if (immuneRoles !== undefined) updates.immuneRoles = immuneRoles;
      if (escalationTiers !== undefined) {
        // Validate escalation tiers
        if (!Array.isArray(escalationTiers)) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "escalationTiers must be an array" },
          });
          return;
        }
        for (const tier of escalationTiers) {
          if (!tier.name || tier.pointsThreshold === undefined || !tier.action) {
            res.status(400).json({
              success: false,
              error: { code: "INVALID_INPUT", message: "Each tier requires name, pointsThreshold, and action" },
            });
            return;
          }
          if (!["timeout", "kick", "ban"].includes(tier.action)) {
            res.status(400).json({
              success: false,
              error: { code: "INVALID_INPUT", message: `Invalid escalation action: ${tier.action}` },
            });
            return;
          }
        }
        updates.escalationTiers = escalationTiers.map((tier: any) => ({
          ...tier,
          duration: tier.action === "timeout" ? parseDuration(tier.duration) : null,
        }));
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "No valid fields to update" },
        });
        return;
      }

      const config = await deps.moderationService.updateConfig(guildId, updates);
      if (!config) {
        res.status(500).json({
          success: false,
          error: { code: "UPDATE_FAILED", message: "Failed to update config" },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
