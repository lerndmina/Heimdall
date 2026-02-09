/**
 * PUT /api/guilds/:guildId/moderation/rules/:ruleId
 *
 * Update an existing automod rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex } from "../utils/regex-engine.js";
import { parseWildcardPatterns } from "../utils/wildcard.js";

export function createRulesUpdateRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.put("/:ruleId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, ruleId } = req.params;
      const {
        name,
        patterns: rawPatterns,
        wildcardPatterns,
        matchMode,
        target,
        actions,
        warnPoints,
        priority,
        enabled,
        channelInclude,
        channelExclude,
        roleInclude,
        roleExclude,
        dmTemplate,
        dmEmbed,
      } = req.body;

      // Verify rule exists
      const existing = await deps.moderationService.getRule(guildId as string, ruleId as string);
      if (!existing) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Rule not found" },
        });
        return;
      }

      // Build patterns — both wildcard and regex can be provided and are merged
      let patterns: Array<{ regex: string; flags?: string; label?: string }> | undefined;

      const hasWildcard = wildcardPatterns && (typeof wildcardPatterns === "string" ? wildcardPatterns.trim() : true);
      const hasRegex = rawPatterns && Array.isArray(rawPatterns) && rawPatterns.length > 0;

      if (hasWildcard || hasRegex) {
        patterns = [];

        if (hasWildcard) {
          const input = Array.isArray(wildcardPatterns) ? wildcardPatterns.join(",") : wildcardPatterns;
          const result = parseWildcardPatterns(input);
          if (!result.success) {
            res.status(400).json({
              success: false,
              error: { code: "INVALID_INPUT", message: result.errors.join("; ") || "Invalid wildcard patterns" },
            });
            return;
          }
          patterns.push(...result.patterns.map((p) => ({ regex: p.regex, flags: p.flags, label: p.label })));
        }

        if (hasRegex) {
          for (const p of rawPatterns) {
            if (!p.regex) {
              res.status(400).json({
                success: false,
                error: { code: "INVALID_INPUT", message: "Each pattern must have a regex field" },
              });
              return;
            }
            const validation = validateRegex(p.regex, p.flags);
            if (!validation.valid) {
              res.status(400).json({
                success: false,
                error: { code: "INVALID_REGEX", message: `Invalid regex "${p.regex}": ${validation.error}` },
              });
              return;
            }
          }
          patterns.push(...rawPatterns);
        }

        if (patterns.length === 0) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: "At least one pattern (wildcard or regex) is required" },
          });
          return;
        }
      }

      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (patterns !== undefined) updates.patterns = patterns;
      if (matchMode !== undefined) updates.matchMode = matchMode;
      if (target !== undefined) updates.target = Array.isArray(target) ? target : [target];
      if (actions !== undefined) updates.actions = actions;
      if (warnPoints !== undefined) updates.warnPoints = warnPoints;
      if (priority !== undefined) updates.priority = priority;
      if (enabled !== undefined) updates.enabled = enabled;
      if (channelInclude !== undefined) updates.channelInclude = channelInclude;
      if (channelExclude !== undefined) updates.channelExclude = channelExclude;
      if (roleInclude !== undefined) updates.roleInclude = roleInclude;
      if (roleExclude !== undefined) updates.roleExclude = roleExclude;
      if (dmTemplate !== undefined) updates.dmTemplate = dmTemplate;
      if (dmEmbed !== undefined) updates.dmEmbed = dmEmbed;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "No valid fields to update" },
        });
        return;
      }

      const rule = await deps.moderationService.updateRule(guildId as string, ruleId as string, updates);
      if (!rule) {
        res.status(500).json({
          success: false,
          error: { code: "UPDATE_FAILED", message: "Failed to update rule" },
        });
        return;
      }

      res.json({ success: true, data: rule });
    } catch (error: any) {
      if (error?.code === 11000) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: `A rule with that name already exists` },
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
