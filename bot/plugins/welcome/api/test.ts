/**
 * POST /api/guilds/:guildId/welcome/test
 *
 * Test a welcome message with mock member data.
 *
 * @swagger
 * /api/guilds/{guildId}/welcome/test:
 *   post:
 *     summary: Test welcome message
 *     description: Parse a welcome message with sample data and return the result
 *     tags: [Welcome]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Custom message to test (uses saved config if omitted)
 *     responses:
 *       200:
 *         description: Parsed message preview
 *       404:
 *         description: No configuration found and no message provided
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { WelcomeApiDependencies } from "./index.js";

export function createTestRoutes(deps: WelcomeApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const bodyMessage = req.body?.message as string | undefined;

      let messageToTest: string;
      let usedCurrentConfig = false;

      if (bodyMessage && typeof bodyMessage === "string") {
        messageToTest = bodyMessage;
      } else {
        const config = await deps.welcomeService.getConfig(guildId);
        if (!config) {
          res.status(404).json({
            success: false,
            error: { code: "NOT_FOUND", message: "No welcome message configuration found. Provide a message to test." },
          });
          return;
        }
        messageToTest = config.message;
        usedCurrentConfig = true;
      }

      // Build a mock member for template parsing
      const guild = await deps.lib.thingGetter.getGuild(guildId);
      const guildName = guild?.name ?? "Example Server";
      const memberCount = guild?.memberCount ?? 100;

      // Simple string replacement for mock data (can't use the service's parseMessage without a real GuildMember)
      let parsed = messageToTest;
      const mockReplacements: Record<string, string> = {
        "{username}": "new_member",
        "{displayname}": "New Member",
        "{mention}": "@new_member",
        "{id}": "123456789012345678",
        "{guild}": guildName,
        "{membercount}": memberCount.toString(),
        "{newline}": "\n",
      };

      for (const [placeholder, value] of Object.entries(mockReplacements)) {
        const escaped = placeholder.replace(/[{}]/g, "\\$&");
        parsed = parsed.replace(new RegExp(escaped, "g"), value);
      }

      res.json({
        success: true,
        data: {
          guildId,
          originalMessage: messageToTest,
          parsedMessage: parsed,
          usedCurrentConfig,
          sampleData: {
            username: "new_member",
            displayName: "New Member",
            mention: "@new_member",
            id: "123456789012345678",
            guild: guildName,
            memberCount,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
