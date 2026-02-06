/**
 * POST /api/guilds/:guildId/tags/:name/use
 *
 * Increment a tag's usage counter.
 *
 * @swagger
 * /api/guilds/{guildId}/tags/{name}/use:
 *   post:
 *     summary: Increment tag usage counter
 *     description: Increment the usage counter for a tag (called when tag is used)
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usage counter incremented
 *       404:
 *         description: Tag not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagUseRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/:name/use", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;

      const tag = await deps.tagService.incrementUses(guildId, name);
      if (!tag) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Tag "${name}" not found` },
        });
        return;
      }

      res.json({ success: true, data: { uses: tag.uses } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
