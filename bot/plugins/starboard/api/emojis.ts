import { Router, type NextFunction, type Request, type Response } from "express";
import type { StarboardApiDependencies } from "./index.js";

export function createEmojiRoutes(_deps: StarboardApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const guild = await _deps.lib.thingGetter.getGuild(guildId);

      if (!guild) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Guild not found" },
        });
        return;
      }

      const emojis = guild.emojis.cache.map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        identifier: emoji.toString(),
        url: emoji.imageURL({ size: 64 }),
      }));

      res.json({ success: true, data: { emojis } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
