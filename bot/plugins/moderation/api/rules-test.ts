/**
 * POST /api/guilds/:guildId/moderation/rules/test
 *
 * Test regex patterns against sample text without creating a rule.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { ModerationApiDeps } from "./index.js";
import { validateRegex, testPatterns } from "../utils/regex-engine.js";
import { parseWildcardPatterns, testWildcard } from "../utils/wildcard.js";

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

  // ── POST /test-wildcard — Test wildcard patterns against sample text ──

  router.post("/test-wildcard", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { wildcardPatterns, testContent } = req.body;

      if (!wildcardPatterns || typeof wildcardPatterns !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "wildcardPatterns (comma-separated string) is required" },
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

      const parsed = parseWildcardPatterns(wildcardPatterns);

      // Test each pattern and report results
      const results = parsed.patterns.map((p) => ({
        wildcard: p.wildcard,
        regex: p.regex,
        label: p.label,
        matched: testWildcard(p.wildcard, testContent),
      }));

      const anyMatched = results.some((r) => r.matched);

      res.json({
        success: true,
        data: {
          matched: anyMatched,
          results,
          errors: parsed.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
