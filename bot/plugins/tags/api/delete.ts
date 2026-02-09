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
import type { TagSlashCommandService } from "../services/TagSlashCommandService.js";

export function createTagDeleteRoutes(deps: TagsApiDependencies & { tagSlashCommandService?: TagSlashCommandService }): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:name", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;

      // Check if the tag was a slash command before deleting
      const tag = await deps.tagService.getTag(guildId, name);
      const wasSlashCommand = tag?.registerAsSlashCommand === true;

      const deleted = await deps.tagService.deleteTag(guildId, name);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: `Tag "${name}" not found` },
        });
        return;
      }

      // If it was a slash command, re-sync guild commands
      if (wasSlashCommand && deps.tagSlashCommandService) {
        try {
          // Tag is already deleted; the provider will no longer return it,
          // so refreshing guild commands is sufficient to remove it from Discord
          await deps.tagSlashCommandService.toggleSlashCommand(guildId, name, false).catch(() => {});
        } catch {
          // Non-critical
        }
      }

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
