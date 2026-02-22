import { Router, type Request, type Response, type NextFunction } from "express";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import { MAX_ROLEBUTTON_PANELS, MAX_NAME_LENGTH } from "../../../src/core/DashboardLimits.js";
import RoleButtonPanel from "../models/RoleButtonPanel.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsCreateRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const createdBy = req.header("X-User-Id");
      const { name } = req.body ?? {};

      if (!createdBy) {
        res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "X-User-Id header is required" },
        });
        return;
      }

      if (!name) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: "name is required" },
        });
        return;
      }

      if (typeof name === "string" && name.length > MAX_NAME_LENGTH) {
        res.status(400).json({
          success: false,
          error: { code: "INVALID_INPUT", message: `name must be ${MAX_NAME_LENGTH} characters or less` },
        });
        return;
      }

      // Enforce per-guild panel count limit
      const existingCount = await RoleButtonPanel.countDocuments({ guildId });
      if (existingCount >= MAX_ROLEBUTTON_PANELS) {
        res.status(400).json({
          success: false,
          error: { code: "LIMIT_REACHED", message: `Cannot create more than ${MAX_ROLEBUTTON_PANELS} role button panels per guild` },
        });
        return;
      }

      const panel = await deps.roleButtonService.createPanel(guildId, String(name), String(createdBy));
      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.status(201).json({ success: true, data: panel });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
