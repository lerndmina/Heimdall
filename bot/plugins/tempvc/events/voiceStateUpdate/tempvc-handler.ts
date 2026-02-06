/**
 * voiceStateUpdate — Join-to-create temp VC handler
 *
 * When a user joins a configured creator channel, create a temp VC
 * and move them into it.
 */

import { Events, type VoiceState, type VoiceChannel, ChannelType } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { TempVCPluginAPI } from "../../index.js";
import TempVC from "../../models/TempVC.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("tempvc:handler");

export const event = Events.VoiceStateUpdate;
export const pluginName = "tempvc";

export async function execute(client: HeimdallClient, oldState: VoiceState, newState: VoiceState): Promise<void> {
  // Only care about channel joins (not leaves or moves where newState has no channel)
  if (!newState.channelId) return;
  // Skip if user moved within same channel (mute/deafen etc.)
  if (oldState.channelId === newState.channelId) return;

  const guild = newState.guild;
  const member = newState.member;
  if (!member) return;

  // Check if the joined channel is a configured creator channel
  const config = await TempVC.findOne({ guildId: guild.id });
  if (!config) return;

  const channelConfig = config.channels.find((ch) => ch.channelId === newState.channelId);
  if (!channelConfig) return;

  // It's a creator channel — get the plugin API
  const api = client.plugins?.get("tempvc") as TempVCPluginAPI | undefined;
  if (!api?.tempVCService) {
    log.error("TempVC plugin API not available");
    return;
  }

  const sourceChannel = newState.channel as VoiceChannel;
  if (!sourceChannel || sourceChannel.type !== ChannelType.GuildVoice) return;

  try {
    await api.tempVCService.createTempChannel(member, channelConfig, sourceChannel);
  } catch (error) {
    log.error(`Failed to create temp channel for ${member.id}:`, error);
  }
}
