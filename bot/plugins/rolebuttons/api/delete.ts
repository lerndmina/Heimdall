import { Router, type Request, type Response, type NextFunction } from "express";
import type { TextBasedChannel } from "discord.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsDeleteRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:panelId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;
      const deletePosts = req.query.deletePosts === "true";

      const panel = await deps.roleButtonService.getPanel(guildId, panelId);
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      if (deletePosts) {
        for (const post of panel.posts ?? []) {
          try {
            const guild = await deps.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(post.channelId);
            if (channel?.isTextBased()) {
              const message = await (channel as TextBasedChannel).messages.fetch(post.messageId);
              await message.delete().catch(() => null);
            }
          } catch {
            // ignore
          }
        }
      }

      await deps.roleButtonService.deletePanel(guildId, panelId);
      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
