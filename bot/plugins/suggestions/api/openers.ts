/**
 * CRUD /api/guilds/:guildId/suggestions/openers
 *
 * @swagger
 * /api/guilds/{guildId}/suggestions/openers:
 *   get:
 *     summary: List suggestion openers
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of openers
 * /api/guilds/{guildId}/suggestions/openers/{openerId}:
 *   delete:
 *     summary: Delete an opener
 *     tags: [Suggestions]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: openerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Opener deleted
 *       404:
 *         description: Opener not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { SuggestionsApiDependencies } from "./index.js";
import SuggestionOpener from "../models/SuggestionOpener.js";

export function createOpenerRoutes(deps: SuggestionsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  // List openers
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const openers = await SuggestionOpener.find({ guildId }).lean();
      res.json({ success: true, data: openers });
    } catch (error) {
      next(error);
    }
  });

  // Delete opener
  router.delete("/:openerId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId, openerId } = req.params;
      const result = await SuggestionOpener.deleteOne({ _id: openerId, guildId });

      if (result.deletedCount === 0) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Opener not found" },
        });
        return;
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
