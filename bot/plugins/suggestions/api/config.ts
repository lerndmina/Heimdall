/**
 * GET/PUT /api/guilds/:guildId/suggestions/config
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/config:
 *   get:
 *     summary: Get suggestion configuration
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Config retrieved
 *       404:
 *         description: No config found
 *   put:
 *     summary: Update suggestion configuration
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxChannels:
 *                 type: integer
 *               voteCooldown:
 *                 type: integer
 *               submissionCooldown:
 *                 type: integer
 *               enableCategories:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Config updated
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import { SuggestionConfigHelper } from "../models/SuggestionConfig.js";
import SuggestionConfig from "../models/SuggestionConfig.js";
import { MAX_SUGGESTION_CHANNELS, MIN_VOTE_COOLDOWN, MAX_VOTE_COOLDOWN, MIN_SUBMISSION_COOLDOWN, MAX_SUBMISSION_COOLDOWN } from "../../../src/core/DashboardLimits.js";

export function createConfigRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const config = await SuggestionConfigHelper.getGuildConfig(guildId);
      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No suggestion config for this guild" },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { maxChannels, voteCooldown, submissionCooldown, enableCategories } = req.body;
      const updatedBy = req.header("X-User-Id");

      if (!updatedBy) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (maxChannels !== undefined) {
        const val = Number(maxChannels);
        if (!Number.isInteger(val) || val < 1 || val > MAX_SUGGESTION_CHANNELS) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: `maxChannels must be an integer between 1 and ${MAX_SUGGESTION_CHANNELS}` },
          });
          return;
        }
        updateData.maxChannels = val;
      }
      if (voteCooldown !== undefined) {
        const val = Number(voteCooldown);
        if (!Number.isInteger(val) || val < MIN_VOTE_COOLDOWN || val > MAX_VOTE_COOLDOWN) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: `voteCooldown must be an integer between ${MIN_VOTE_COOLDOWN} and ${MAX_VOTE_COOLDOWN}` },
          });
          return;
        }
        updateData.voteCooldown = val;
      }
      if (submissionCooldown !== undefined) {
        const val = Number(submissionCooldown);
        if (!Number.isInteger(val) || val < MIN_SUBMISSION_COOLDOWN || val > MAX_SUBMISSION_COOLDOWN) {
          res.status(400).json({
            success: false,
            error: { code: "INVALID_INPUT", message: `submissionCooldown must be an integer between ${MIN_SUBMISSION_COOLDOWN} and ${MAX_SUBMISSION_COOLDOWN}` },
          });
          return;
        }
        updateData.submissionCooldown = val;
      }
      if (enableCategories !== undefined) updateData.enableCategories = Boolean(enableCategories);
      updateData.updatedBy = updatedBy;

      const config = await SuggestionConfig.findOneAndUpdate({ guildId }, updateData, { new: true, upsert: true });

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
