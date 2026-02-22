/**
 * PATCH /api/guilds/:guildId/suggestions/:suggestionId/status
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/{suggestionId}/status:
 *   patch:
 *     summary: Update suggestion status
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status, managedBy]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, denied]
 *               managedBy:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 *       404:
 *         description: Suggestion not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import Suggestion, { SuggestionStatus } from "../models/Suggestion.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

export function createSuggestionStatusRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.patch("/:suggestionId/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const suggestionId = req.params.suggestionId as string;
      const { status } = req.body;
      const managedBy = req.header("X-User-Id");

      if (!managedBy) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      if (!status) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "status is required" },
        });
        return;
      }

      if (!Object.values(SuggestionStatus).includes(status)) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `Invalid status. Must be one of: ${Object.values(SuggestionStatus).join(", ")}` },
        });
        return;
      }

      const suggestion = await Suggestion.findOneAndUpdate({ id: suggestionId, guildId }, { status, managedBy }, { new: true });

      if (!suggestion) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Suggestion "${suggestionId}" not found` },
        });
        return;
      }

      // Update the vote display on the message
      await deps.suggestionService.updateVoteDisplay(suggestionId);

      broadcastDashboardChange(guildId, "suggestions", "status_updated", {
        data: { suggestionId, status, managedBy },
      });

      res.json({ success: true, data: suggestion });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
