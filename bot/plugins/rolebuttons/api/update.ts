import { Router, type Request, type Response, type NextFunction } from "express";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsUpdateRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.put("/:panelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;

      const panel = await deps.roleButtonService.updatePanel(guildId, panelId, req.body ?? {});
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.json({ success: true, data: panel });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
