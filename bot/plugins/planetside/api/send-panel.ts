/**
 * POST /api/guilds/:guildId/planetside/send-panel
 *
 * Sends (or re-sends) the PS2 linking panel to a channel.
 * Body: { channelId?: string }
 *   - If channelId is provided, posts there and updates the config.
 *   - If omitted, uses the channel already saved in config.channels.panel.
 */

import { Router, type Request, type Response } from "express";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import type { PlanetSidePanelService } from "../services/PlanetSidePanelService.js";

export function createSendPanelRoutes(panelService: PlanetSidePanelService): Router {
  const router = Router({ mergeParams: true });

  router.post("/", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      const { channelId: bodyChannelId } = req.body ?? {};

      let channelId: string = bodyChannelId?.trim() || "";

      if (!channelId) {
        const config = await PlanetSideConfig.findOne({ guildId }).select("channels.panel").lean();
        if (!config?.channels?.panel) {
          return res.status(400).json({
            error: { code: "NO_CHANNEL", message: "No panel channel configured. Set one in the Channels step first." },
          });
        }
        channelId = String(config.channels.panel);
      }

      const result = await panelService.sendPanel(channelId, guildId);

      if (!result.success) {
        return res.status(400).json({
          error: { code: "SEND_FAILED", message: result.error ?? "Failed to send panel." },
        });
      }

      return res.json({ success: true, messageUrl: result.messageUrl });
    } catch (err) {
      return res.status(500).json({ error: { code: "INTERNAL", message: "Internal server error." } });
    }
  });

  return router;
}
