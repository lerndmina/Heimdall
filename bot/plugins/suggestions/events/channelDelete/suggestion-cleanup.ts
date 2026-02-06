/**
 * Channel Delete Event — Clean up suggestion channels when a channel is deleted
 */

import { Events, type DMChannel, type GuildChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:channelDelete");

export const event = Events.ChannelDelete;
export const pluginName = "suggestions";

export async function execute(client: HeimdallClient, channel: DMChannel | GuildChannel): Promise<void> {
  // DM channels don't have guild context
  if (channel.isDMBased()) return;

  try {
    const pluginAPI = client.plugins?.get("suggestions") as SuggestionsPluginAPI | undefined;
    if (!pluginAPI) return;

    await pluginAPI.suggestionService.handleChannelDelete(channel.id);
  } catch (error) {
    log.error(`Error handling channel delete for suggestions:`, error);
  }
}
