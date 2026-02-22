/**
 * POST /api/guilds/:guildId/welcome/test
 *
 * Send a test welcome message to the configured channel using mock member data.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/test:
 *   post:
 *     summary: Send a test welcome message
 *     description: Send a parsed welcome message with sample data to the configured channel
 *     tags: [Welcome]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test message sent successfully
 *       404:
 *         description: No configuration found
 *       502:
 *         description: Failed to send the message to Discord
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createTestRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const result = await deps.welcomeService.sendTestMessage(guildId);

      if (!result.success) {
        const isNotFound = result.error === "No welcome configuration found";
        res.status(isNotFound ? 404 : 502).json({
          success: false,
          error: {
            code: isNotFound ? "NOT_FOUND" : "SEND_FAILED",
            message: result.error ?? "Failed to send test message",
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          guildId,
          channelId: result.channelId,
          parsedMessage: result.parsedMessage,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
