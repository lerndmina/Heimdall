import { Router, type Request, type Response, type NextFunction } from "express";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsListRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panels = await deps.roleButtonService.listPanels(guildId);
      res.json({ success: true, data: panels });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
