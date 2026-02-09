/**
 * PATCH /api/guilds/:guildId/tags/:name/slash-command
 *
 * Toggle whether a tag is registered as a standalone guild slash command.
 *
 * @swagger
 * /api/guilds/{guildId}/tags/{name}/slash-command:
 *   patch:
 *     summary: Toggle tag slash command registration
 *     description: Enable or disable registering this tag's name as a standalone slash command in the guild
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
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Slash command toggled
 *       400:
 *         description: Invalid input or name collision
 *       404:
 *         description: Tag not found
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { TagsApiDependencies } from "./index.js";
import type { TagSlashCommandService } from "../services/TagSlashCommandService.js";

export interface SlashCommandApiDeps extends TagsApiDependencies {
  tagSlashCommandService: TagSlashCommandService;
}

export function createTagSlashCommandRoutes(deps: SlashCommandApiDeps): Router {
  const router = Router({ mergeParams: true });

  router.patch("/:name/slash-command", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const name = req.params.name as string;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "enabled must be a boolean" },
        });
        return;
      }

      const result = await deps.tagSlashCommandService.toggleSlashCommand(guildId, name, enabled);

      if (!result.success) {
        const status = result.error?.includes("not found") ? 404 : 400;
        res.status(status).json({
          success: false,
          error: { code: status === 404 ? "NOT_FOUND" : "TOGGLE_FAILED", message: result.error },
        });
        return;
      }

      res.json({
        success: true,
        data: { name, registerAsSlashCommand: enabled },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
