/**
 * PUT /api/guilds/:guildId/welcome/config
 *
 * Create or update the welcome message configuration.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/config:
 *   put:
 *     summary: Update welcome message configuration
 *     description: Create or update the welcome channel and message template
 *     tags: [Welcome]
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
 *             required: [channelId, message]
 *             properties:
 *               channelId:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated configuration
 *       201:
 *         description: Created configuration
 *       400:
 *         description: Validation error
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createConfigUpdateRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const { channelId, message } = req.body;

      // Validate body
      if (!channelId || typeof channelId !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "channelId is required and must be a string" },
        });
        return;
      }

      if (!message || typeof message !== "string") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "message is required and must be a string" },
        });
        return;
      }

      if (message.length > 2000) {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Message must be at most 2000 characters" },
        });
        return;
      }

      // Check if this is an update or create
      const existing = await deps.welcomeService.getConfig(guildId);
      const config = await deps.welcomeService.upsertConfig(guildId, channelId, message);

      res.status(existing ? 200 : 201).json({
        success: true,
        data: {
          guildId: config.guildId,
          channelId: config.channelId,
          message: config.message,
          wasCreated: !existing,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
