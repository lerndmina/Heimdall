import { Router, type Request, type Response, type NextFunction } from "express";
import type { TextBasedChannel } from "discord.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { RoleButtonsApiDependencies } from "./index.js";

export function createRoleButtonsDeletePostRoutes(deps: RoleButtonsApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.delete("/:panelId/posts/:messageId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const guildId = req.params.guildId as string;
      const panelId = req.params.panelId as string;
      const messageId = req.params.messageId as string;

      const panel = await deps.roleButtonService.getPanel(guildId, panelId);
      if (!panel) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Panel not found" } });
        return;
      }

      const post = panel.posts.find((entry) => entry.messageId === messageId);
      if (!post) {
        res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Post not found" } });
        return;
      }

      try {
        const guild = await deps.client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(post.channelId);
        if (channel?.isTextBased()) {
          const message = await (channel as TextBasedChannel).messages.fetch(post.messageId);
          await message.delete().catch(() => null);
        }
      } catch {
        // ignore discord delete failures
      }

      panel.posts = panel.posts.filter((entry) => entry.messageId !== messageId) as any;
      await (panel as any).save();

      broadcastDashboardChange(guildId, "rolebuttons", "updated", { requiredAction: "rolebuttons.manage" });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
