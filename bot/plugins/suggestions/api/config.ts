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
      const { maxChannels, voteCooldown, submissionCooldown, enableCategories, updatedBy: updatedByBody } = req.body;
      const updatedBy = req.header("X-User-Id") || updatedByBody;

      const updateData: Record<string, unknown> = {};
      if (maxChannels !== undefined) updateData.maxChannels = maxChannels;
      if (voteCooldown !== undefined) updateData.voteCooldown = voteCooldown;
      if (submissionCooldown !== undefined) updateData.submissionCooldown = submissionCooldown;
      if (enableCategories !== undefined) updateData.enableCategories = enableCategories;
      if (updatedBy) updateData.updatedBy = updatedBy;

      const config = await SuggestionConfig.findOneAndUpdate({ guildId }, updateData, { new: true, upsert: true });

      res.json({ success: true, data: config });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
