/**
 * PUT /api/guilds/:guildId/tags/:name
 *
 * Update an existing tag's content.
 *
 * @swagger
 * /api/guilds/{guildId}/tags/{name}:
 *   put:
 *     summary: Update a tag
 *     description: Update the content of an existing tag
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Tag updated
 *       404:
 *         description: Tag not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagUpdateRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.put("/:name", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "content is required" },
        });
        return;
      }

      const tag = await deps.tagService.updateTag(guildId, name, content);
      if (!tag) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Tag "${name}" not found` },
        });
        return;
      }

      res.json({ success: true, data: tag });
    } catch (error) {
      if (error instanceof Error && error.message.includes("2000 characters")) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: error.message },
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
