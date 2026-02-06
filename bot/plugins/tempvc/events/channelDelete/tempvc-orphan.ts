/**
 * channelDelete — Clean up orphaned temp channel records
 *
 * When a channel is manually deleted (by admin, Discord, etc.),
 * remove it from ActiveTempChannels tracking.
 */

import { Events, type GuildChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import ActiveTempChannels from "../../models/ActiveTempChannels.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("tempvc:orphan");

export const event = Events.ChannelDelete;
export const pluginName = "tempvc";

export async function execute(client: HeimdallClient, channel: GuildChannel): Promise<void> {
  try {
    const result = await ActiveTempChannels.findOneAndUpdate({ guildId: channel.guild.id, channelIds: channel.id }, { $pull: { channelIds: channel.id } });

    if (result) {
      log.debug(`Cleaned up orphaned temp channel record for ${channel.id}`);
    }
  } catch (error) {
    log.error("Error handling channel delete:", error);
  }
}
