/**
 * GET /api/guilds/:guildId/tags
 *
 * List all tags for a guild with optional search, sorting, and pagination.
 *
 * @swagger
 * /api/guilds/{guildId}/tags:
 *   get:
 *     summary: List all tags
 *     description: Get a paginated list of tags for a guild with optional search and sorting
 *     tags: [Tags]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter tags by name (case-insensitive)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [name, uses, createdAt]
 *         description: Sort field (default name)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Results per page (default 50)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Results to skip (default 0)
 *     responses:
 *       200:
 *         description: List of tags
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";

export function createTagListRoutes(deps: TagsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const search = req.query.search as string | undefined;
      const sort = (req.query.sort as "name" | "uses" | "createdAt") || "name";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const result = await deps.tagService.listTags(guildId, { search, sort, limit, offset });

      res.json({
        success: true,
        data: {
          tags: result.tags,
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
