/**
 * POST /api/guilds/:guildId/tags
 *
 * Create a new tag.
 *
 * @swagger
 * /api/guilds/{guildId}/tags:
 *   post:
 *     summary: Create a new tag
 *     description: Create a new custom tag for the guild
 *     tags: [Tags]
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
 *             required: [name, content, createdBy]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 32
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *               createdBy:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tag created
 *       400:
 *         description: Invalid input or tag already exists
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagCreateRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const createdBy = req.header("X-User-Id");
      const { name, content } = req.body;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      if (!name || !content) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "name and content are required" },
        });
        return;
      }

      const tag = await deps.tagService.createTag(guildId, name, content, createdBy);
      if (!tag) {
        res.status(400).json({
          success: false,
          error: { code: "ALREADY_EXISTS", message: `Tag "${name}" already exists` },
        });
        return;
      }

      res.status(201).json({ success: true, data: tag });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Tag name can only")) {
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
