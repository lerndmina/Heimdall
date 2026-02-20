/**
 * On ready — start Census + Honu API health monitoring
 */

import { Events, type Client } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("planetside:census-monitor");

export const event = Events.ClientReady;
export const once = true;
export const pluginName = "planetside";

export async function execute(client: Client<true>): Promise<void> {
  log.debug("Starting census monitor from ready event");

  // The actual monitor is started by the plugin's onLoad → censusMonitorService.startAll()
  // This event handler is a safety net in case the monitor needs restarting
  const heimdallClient = client as HeimdallClient;
  const pluginAPI = heimdallClient.plugins?.get("planetside");

  if (pluginAPI && typeof pluginAPI === "object" && "censusMonitorService" in pluginAPI) {
    (pluginAPI as any).censusMonitorService.startAll().catch((error: unknown) => {
      log.error("Failed to start census monitor:", error);
    });
  }
}
