/**
 * DELETE /api/guilds/:guildId/tags/:name
 *
 * Delete a tag.
 *
 * @swagger
 * /api/guilds/{guildId}/tags/{name}:
 *   delete:
 *     summary: Delete a tag
 *     description: Remove a tag from the guild
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
 *         description: Tag deleted
 *       404:
 *         description: Tag not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagDeleteRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:name", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;

      const deleted = await deps.tagService.deleteTag(guildId, name);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Tag "${name}" not found` },
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
