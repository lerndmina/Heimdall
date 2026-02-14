import { Router, type Request, type Response, type NextFunction } from "express";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsUpdatePostsRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/:panelId/update-posts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;

      const panel = await deps.roleButtonService.getPanel(guildId, panelId);
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      const result = await deps.roleButtonService.updatePostedPanels(panel as any, deps.client as any, deps.lib);
      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
