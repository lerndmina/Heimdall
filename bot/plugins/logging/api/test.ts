/**
 * POST /api/guilds/:guildId/logging/test
 *
 * Send a test embed to all configured logging channels.
 *
 * @swagger
 * /api/guilds/{guildId}/logging/test:
 *   post:
 *     summary: Send test logging message
 *     description: Sends a test embed to all configured logging channels to verify setup
 *     tags: [Logging]
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test messages sent
 *       404:
 *         description: No logging configured
 */

import { TextChannel } from "discord.js";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { LoggingApiDependencies } from "./index.js";

export function createTestRoutes(deps: LoggingApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;

      const config = await deps.loggingService.getConfig(guildId);
      if (!config || config.categories.length === 0) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No logging configured for this guild" },
        });
        return;
      }

      const results: Array<{ category: string; success: boolean; error?: string }> = [];

      for (const cat of config.categories) {
        if (!cat.enabled) {
          results.push({ category: cat.category, success: false, error: "Category disabled" });
          continue;
        }

        try {
          const channel = deps.lib.thingGetter.getChannel(cat.channelId);
          if (!channel || !(channel instanceof TextChannel)) {
            results.push({ category: cat.category, success: false, error: "Channel not found" });
            continue;
          }

          const embed = deps.lib
            .createEmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🧪 Logging Test")
            .setDescription(`This is a test message for **${cat.category}** logging.\n\nIf you can see this, logging is working correctly!`)
            .setTimestamp();

          await channel.send({ embeds: [embed] });
          results.push({ category: cat.category, success: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          results.push({ category: cat.category, success: false, error: msg });
        }
      }

      res.json({ success: true, data: { results } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
