/**
 * POST /api/guilds/:guildId/moderation/rules/test
 *
 * Test regex patterns against sample text without creating a rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex, testPatterns } from "../utils/regex-engine.js";

export function createRulesTestRoutes(deps: ModerationApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.post("/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patterns, matchMode, testContent } = req.body;

      if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "patterns (non-empty array) is required" },
        });
        return;
      }

      if (!testContent || typeof testContent !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "testContent (string) is required" },
        });
        return;
      }

      // Validate all patterns
      const validationResults: Array<{ regex: string; flags?: string; valid: boolean; error?: string }> = [];
      for (const p of patterns) {
        const validation = validateRegex(p.regex, p.flags);
        validationResults.push({
          regex: p.regex,
          flags: p.flags,
          valid: validation.valid,
          error: validation.error,
        });
      }

      const invalidPatterns = validationResults.filter((v) => !v.valid);
      if (invalidPatterns.length > 0) {
        res.json({
          success: true,
          data: {
            matched: false,
            matchedPatterns: [],
            invalidPatterns,
          },
        });
        return;
      }

      // Test patterns against content
      const result = testPatterns(patterns, testContent, (matchMode as "any" | "all") ?? "any");

      res.json({
        success: true,
        data: {
          matched: result.matched,
          matchedPattern: result.matchedPattern,
          invalidPatterns: [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
