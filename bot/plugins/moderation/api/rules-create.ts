/**
 * POST /api/guilds/:guildId/moderation/rules
 *
 * Create a new automod rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex } from "../utils/regex-engine.js";
import { parseWildcardPatterns } from "../utils/wildcard.js";

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

      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "actions (non-empty array) is required" },
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
