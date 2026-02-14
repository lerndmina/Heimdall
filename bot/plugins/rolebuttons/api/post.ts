import { Router, type Request, type Response, type NextFunction } from "express";
import type { GuildTextBasedChannel } from "discord.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsPostRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/:panelId/post", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;
      const channelId = String(req.body?.channelId ?? "");
      const postedBy = String(req.body?.postedBy ?? "dashboard");

      if (!channelId) {
        res.status(400).json({ success: false, error: { code: "INVALID_INPUT", message: "channelId is required" } });
        return;
      }

      const panel = await deps.roleButtonService.getPanel(guildId, panelId);
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      const guild = await deps.client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !("send" in channel)) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Channel not found" } });
        return;
      }

      const updatedPanel = await deps.roleButtonService.postPanel(panel as any, channel as GuildTextBasedChannel, postedBy, deps.lib);
      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.json({ success: true, data: updatedPanel });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
