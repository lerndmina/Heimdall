import { Client, Snowflake, VoiceChannel, VoiceState } from "discord.js";
import ActiveTempChannels from "../../models/ActiveTempChannels";
import log from "../../utils/log";
import Database from "../../utils/data/database";
import { fetchChannelNumber, setChannelNumberCache } from "./joinedTempVC";

export default async (oldState: VoiceState, newState: VoiceState, client: Client) => {
  if (oldState.channelId == null) return;
  const leftChannelID = oldState.channelId;
  const guildId = oldState.guild.id;

  // Check if the channel is a temp VC
  const vcList = await ActiveTempChannels.findOne({ guildID: guildId });

  if (!vcList) return;

  // Check if the channel is a temp VC

  const vc = vcList.channelIDs.find((vc: Snowflake) => vc === leftChannelID) as Snowflake;
  if (!vc) return;

  const channel = oldState.guild.channels.cache.get(vc as Snowflake) as VoiceChannel;

  if (!channel) return;

  // Check if the channel is empty
  if (channel.members.size > 0) return;

  try {
    await channel.delete();

    const db = new Database();
    await db.pullFromSet(ActiveTempChannels, { guildID: guildId }, "channelIDs", leftChannelID);
    const number = await fetchChannelNumber(channel.parentId!);
    setChannelNumberCache(channel.parentId!, number - 1 || 0);
  } catch (error) {
    log.error(error as string);
  }
};
