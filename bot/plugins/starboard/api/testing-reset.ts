import { Router, type NextFunction, type Request, type Response } from "express";
import type { StarboardApiDependencies } from "./index.js";

export function createTestingResetRoutes(deps: StarboardApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/reset-backend", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const result = await deps.starboardService.resetGuildBackendData(guildId);

      res.json({
        success: true,
        data: {
          reset: true,
          ...result,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
