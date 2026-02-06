/**
 * GET /api/guilds/:guildId/suggestions/:suggestionId
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/{suggestionId}:
 *   get:
 *     summary: Get a suggestion by ID
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: suggestionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suggestion retrieved
 *       404:
 *         description: Suggestion not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import Suggestion, { SuggestionHelper } from "../models/Suggestion.js";

export function createSuggestionGetRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/:suggestionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, suggestionId } = req.params;

      const suggestion = await Suggestion.findOne({ id: suggestionId, guildId }).lean();
      if (!suggestion) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Suggestion "${suggestionId}" not found` },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ...suggestion,
          voteCounts: SuggestionHelper.getVoteCounts(suggestion as any),
          netVotes: SuggestionHelper.getNetVotes(suggestion as any),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
