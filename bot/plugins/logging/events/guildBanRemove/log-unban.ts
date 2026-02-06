/**
 * GuildBanRemove event — Log member unbans
 */

import { Events, type GuildBan } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.GuildBanRemove;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, ban: GuildBan): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleBanRemove(ban);
}
