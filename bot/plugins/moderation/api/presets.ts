/**
 * GET /api/guilds/:guildId/moderation/presets
 * POST /api/guilds/:guildId/moderation/presets/:presetId/install
 * DELETE /api/guilds/:guildId/moderation/presets/:presetId
 *
 * Preset management — install/remove preconfigured automod rules.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { getAllPresets, getPreset } from "../utils/presets.js";

export function createPresetsRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET / — List all available presets with installation status
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const presets = getAllPresets();

      // Check which presets are installed
      const presetsWithStatus = await Promise.all(
        presets.map(async (preset) => {
          const existing = await deps.moderationService.findRuleByPresetId(guildId, preset.id);
          return {
            ...preset,
            installed: !!existing,
            ruleId: existing?._id?.toString() ?? null,
            enabled: existing?.enabled ?? false,
          };
        }),
      );

      res.json({ success: true, data: presetsWithStatus });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /:presetId/install — Install a preset as a rule
   */
  router.post("/:presetId/install", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, presetId } = req.params;
      const preset = getPreset(presetId as string);

      if (!preset) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Preset "${presetId}" not found` },
        });
        return;
      }

      // Check if already installed
      const existing = await deps.moderationService.findRuleByPresetId(guildId as string, presetId as string);
      if (existing) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: `Preset "${preset.name}" is already installed` },
        });
        return;
      }

      // Create rule from preset
      const rule = await deps.moderationService.createRule(
        guildId as string,
        {
          name: preset.name,
          patterns: preset.patterns,
          matchMode: preset.matchMode,
          target: Array.isArray(preset.target) ? preset.target : [preset.target],
          actions: preset.actions,
          warnPoints: preset.warnPoints,
          enabled: true,
          isPreset: true,
          presetId: preset.id,
        } as any,
      );

      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /:presetId — Uninstall a preset rule
   */
  router.delete("/:presetId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, presetId } = req.params;
      const deleted = await deps.moderationService.deleteRuleByPresetId(guildId as string, presetId as string);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Preset rule not found or not installed" },
        });
        return;
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
