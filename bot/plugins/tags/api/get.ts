/**
 * GET /api/guilds/:guildId/tags/:name
 *
 * Get a single tag by name.
 *
 * @swagger
 * /api/guilds/{guildId}/tags/{name}:
 *   get:
 *     summary: Get a tag by name
 *     description: Retrieve a single tag by its name
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
 *         description: Tag retrieved
 *       404:
 *         description: Tag not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagGetRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/:name", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;

      const tag = await deps.tagService.getTag(guildId, name);
      if (!tag) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Tag "${name}" not found` },
        });
        return;
      }

      res.json({ success: true, data: tag });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
