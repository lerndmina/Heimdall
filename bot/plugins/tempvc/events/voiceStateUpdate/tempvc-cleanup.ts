/**
 * voiceStateUpdate — Cleanup empty temp channels
 *
 * When a user leaves a temp channel and it becomes empty, delete it.
 */

import { Events, type VoiceState, type VoiceChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import ActiveTempChannels from "../../models/ActiveTempChannels.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("tempvc:cleanup");

export const event = Events.VoiceStateUpdate;
export const pluginName = "tempvc";

export async function execute(client: HeimdallClient, oldState: VoiceState, newState: VoiceState): Promise<void> {
  // Only care about channel leaves (user left a channel)
  if (!oldState.channelId) return;
  // If user moved to another channel, only process if they LEFT a temp channel
  // (the handler above handles the join side)

  const guildId = oldState.guild.id;

  // Check if the departed channel is an active temp channel
  const activeDoc = await ActiveTempChannels.findOne({
    guildId,
    channelIds: oldState.channelId,
  });
  if (!activeDoc) return;

  const channel = oldState.guild.channels.cache.get(oldState.channelId) as VoiceChannel | undefined;

  if (!channel) {
    // Channel already deleted — clean up the record
    await ActiveTempChannels.findOneAndUpdate({ guildId }, { $pull: { channelIds: oldState.channelId } });
    return;
  }

  // Only delete if empty
  if (channel.members.size > 0) return;

  try {
    await channel.delete();
    await ActiveTempChannels.findOneAndUpdate({ guildId }, { $pull: { channelIds: oldState.channelId } });
    log.info(`Deleted empty temp channel ${oldState.channelId} in guild ${guildId}`);
  } catch (error) {
    log.error("Failed to delete empty temp channel:", error);
  }
}
