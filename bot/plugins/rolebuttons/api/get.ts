import { Router, type Request, type Response, type NextFunction } from "express";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsGetRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/:panelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;

      const panel = await deps.roleButtonService.getPanel(guildId, panelId);
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      res.json({ success: true, data: panel });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
