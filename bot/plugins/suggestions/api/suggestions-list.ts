/**
 * GET /api/guilds/:guildId/suggestions
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions:
 *   get:
 *     summary: List suggestions
 *     description: Get a paginated list of suggestions with optional filtering
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, denied]
 *       - in: query
 *         name: channelId
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, votes]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of suggestions
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import Suggestion, { SuggestionHelper } from "../models/Suggestion.js";

export function createSuggestionsListRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const status = req.query.status as string | undefined;
      const channelId = req.query.channelId as string | undefined;
      const userId = req.query.userId as string | undefined;
      const sort = (req.query.sort as string) || "createdAt";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const filter: Record<string, unknown> = { guildId };
      if (status) filter.status = status;
      if (channelId) filter.channelId = channelId;
      if (userId) filter.userId = userId;

      const sortObj: Record<string, 1 | -1> = sort === "votes" ? {} : { createdAt: -1 };

      const [suggestions, total] = await Promise.all([Suggestion.find(filter).sort(sortObj).skip(offset).limit(limit).lean(), Suggestion.countDocuments(filter)]);

      const enriched = suggestions.map((s) => ({
        ...s,
        voteCounts: SuggestionHelper.getVoteCounts(s as any),
        netVotes: SuggestionHelper.getNetVotes(s as any),
      }));

      // Sort by votes if requested
      if (sort === "votes") {
        enriched.sort((a, b) => b.netVotes - a.netVotes);
      }

      res.json({
        success: true,
        data: { suggestions: enriched, total, limit, offset },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
