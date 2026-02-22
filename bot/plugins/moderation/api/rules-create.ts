/**
 * POST /api/guilds/:guildId/moderation/rules
 *
 * Create a new automod rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex } from "../utils/regex-engine.js";
import { parseWildcardPatterns } from "../utils/wildcard.js";
import { MAX_AUTOMOD_RULES, MAX_AUTOMOD_PATTERNS, MAX_AUTOMOD_ACTIONS, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_ID_ARRAY_LENGTH } from "../../../src/core/DashboardLimits.js";
import AutomodRule from "../models/AutomodRule.js";

export function createRulesCreateRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
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

      // Validate required fields
      if (!name) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "name is required" },
        });
        return;
      }

      if (typeof name === "string" && name.length > MAX_NAME_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `name must be ${MAX_NAME_LENGTH} characters or less` },
        });
        return;
      }

      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "actions (non-empty array) is required" },
        });
        return;
      }

      if (actions.length > MAX_AUTOMOD_ACTIONS) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `actions cannot exceed ${MAX_AUTOMOD_ACTIONS} entries` },
        });
        return;
      }

      // Check per-guild rule count
      const existingRuleCount = await AutomodRule.countDocuments({ guildId });
      if (existingRuleCount >= MAX_AUTOMOD_RULES) {
        res.status(400).json({
          success: false,
          error: { code: "LIMIT_REACHED", message: `Cannot create more than ${MAX_AUTOMOD_RULES} automod rules per guild` },
        });
        return;
      }

      // Validate channel/role filter array sizes
      if (channelInclude && Array.isArray(channelInclude) && channelInclude.length > MAX_ID_ARRAY_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `channelInclude cannot exceed ${MAX_ID_ARRAY_LENGTH} entries` },
        });
        return;
      }
      if (channelExclude && Array.isArray(channelExclude) && channelExclude.length > MAX_ID_ARRAY_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `channelExclude cannot exceed ${MAX_ID_ARRAY_LENGTH} entries` },
        });
        return;
      }
      if (roleInclude && Array.isArray(roleInclude) && roleInclude.length > MAX_ID_ARRAY_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `roleInclude cannot exceed ${MAX_ID_ARRAY_LENGTH} entries` },
        });
        return;
      }
      if (roleExclude && Array.isArray(roleExclude) && roleExclude.length > MAX_ID_ARRAY_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `roleExclude cannot exceed ${MAX_ID_ARRAY_LENGTH} entries` },
        });
        return;
      }

      if (dmTemplate !== undefined && typeof dmTemplate === "string" && dmTemplate.length > MAX_DESCRIPTION_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `dmTemplate must be ${MAX_DESCRIPTION_LENGTH} characters or less` },
        });
        return;
      }

      // Build patterns — both wildcard and regex can be provided and are merged
      const patterns: Array<{ regex: string; flags?: string; label?: string }> = [];

      // Convert wildcard patterns if provided
      if (wildcardPatterns) {
        const input = Array.isArray(wildcardPatterns) ? wildcardPatterns.join(",") : wildcardPatterns;
        if (input.trim()) {
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
      }

      // Add raw regex patterns if provided
      if (rawPatterns && Array.isArray(rawPatterns) && rawPatterns.length > 0) {
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

      if (patterns.length > MAX_AUTOMOD_PATTERNS) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `Cannot have more than ${MAX_AUTOMOD_PATTERNS} patterns per rule` },
        });
        return;
      }

      const ruleData: Record<string, any> = {
        name,
        patterns,
        actions,
        matchMode: matchMode ?? "any",
        target: Array.isArray(target) ? target : [target ?? "message_content"],
        warnPoints: warnPoints ?? 0,
        priority: priority ?? 0,
        enabled: enabled ?? true,
      };

      // Preserve original wildcard input for dashboard editing
      if (wildcardPatterns) {
        const wcStr = Array.isArray(wildcardPatterns) ? wildcardPatterns.join(",") : wildcardPatterns;
        if (wcStr.trim()) ruleData.wildcardPatterns = wcStr.trim();
      }

      if (channelInclude) ruleData.channelInclude = channelInclude;
      if (channelExclude) ruleData.channelExclude = channelExclude;
      if (roleInclude) ruleData.roleInclude = roleInclude;
      if (roleExclude) ruleData.roleExclude = roleExclude;
      if (dmTemplate !== undefined) ruleData.dmTemplate = dmTemplate;
      if (dmEmbed !== undefined) ruleData.dmEmbed = dmEmbed;

      const rule = await deps.moderationService.createRule(guildId, ruleData);

      res.status(201).json({ success: true, data: rule });
    } catch (error: any) {
      // Handle duplicate rule name
      if (error?.code === 11000) {
        res.status(409).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: `A rule named "${req.body.name}" already exists` },
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
