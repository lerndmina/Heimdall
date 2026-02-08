/**
 * POST /api/guilds/:guildId/moderation/rules
 *
 * Create a new automod rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex } from "../utils/regex-engine.js";

export function createRulesCreateRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { name, patterns, matchMode, target, actions, warnPoints, priority, enabled, channelInclude, channelExclude, roleInclude, roleExclude, dmTemplate, dmEmbed } = req.body;

      // Validate required fields
      if (!name || !patterns || !Array.isArray(patterns) || patterns.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "name and patterns (non-empty array) are required" },
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

      // Validate regex patterns
      for (const p of patterns) {
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

      const ruleData: Record<string, any> = {
        name,
        patterns,
        actions,
        matchMode: matchMode ?? "any",
        target: target ?? "message_content",
        warnPoints: warnPoints ?? 0,
        priority: priority ?? 0,
        enabled: enabled ?? true,
      };

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
