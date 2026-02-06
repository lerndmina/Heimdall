/**
 * GET /api/guilds/:guildId/suggestions/stats
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/stats:
 *   get:
 *     summary: Get suggestion statistics
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stats retrieved
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import Suggestion, { SuggestionStatus } from "../models/Suggestion.js";

export function createSuggestionStatsRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const [total, pending, approved, denied] = await Promise.all([
        Suggestion.countDocuments({ guildId }),
        Suggestion.countDocuments({ guildId, status: SuggestionStatus.Pending }),
        Suggestion.countDocuments({ guildId, status: SuggestionStatus.Approved }),
        Suggestion.countDocuments({ guildId, status: SuggestionStatus.Denied }),
      ]);

      res.json({
        success: true,
        data: { total, pending, approved, denied },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
