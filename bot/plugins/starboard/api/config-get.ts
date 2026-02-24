import { Router, type NextFunction, type Request, type Response } from "express";
import type { StarboardApiDependencies } from "./index.js";

export function createConfigGetRoutes(deps: StarboardApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const config = await deps.starboardService.getConfig(guildId);

      res.json({
        success: true,
        data: {
          guildId,
          boards: config?.boards ?? [],
          createdAt: config?.createdAt?.toISOString() ?? null,
          updatedAt: config?.updatedAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
