import {
  Client,
  ChannelType,
  PermissionsBitField,
  VoiceState,
  VoiceChannel,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { GuildNewVC } from "../../models/GuildNewVC";
import ActiveTempChannels from "../../models/ActiveTempChannels";
import BasicEmbed from "../../utils/BasicEmbed";
import ButtonWrapper from "../../utils/ButtonWrapper";
import ms from "ms";
import log from "../../utils/log";
import Database from "../../utils/data/database";
import { redisClient } from "../../Bot";
import { tryCatch } from "../../utils/trycatch";
import {
  interactionDeleteVC_REQUEST,
  interactionLimitUsers,
  interactionLockVC,
  interactionPostBanMenu,
  interactionRenameVC,
  interactionSendInvite,
} from "../interactionCreate/tempvc-button-handler";

/**
 *
 * @param {any} oldState
 * @param {any} newState
 * @param {Client} client
 * @returns
 */

export default async (oldState: VoiceState, newState: VoiceState, client: Client<true>) => {
  if (newState.channelId == null) return;
  const db = new Database();
  const joinedChannelId = newState.channelId;
  const guildId = newState.guild.id;

  const vcList = await db.findOne(GuildNewVC, { guildID: guildId }, true);

  if (!vcList) return;

  const vc = vcList.guildChannelIDs.find((vc) => vc.channelID === joinedChannelId);

  if (!vc) return;

  const category = newState.guild.channels.cache.get(vc.categoryID!);

  if (!category) return;

  const joinedChannel = newState.guild.channels.cache.get(joinedChannelId) as VoiceChannel;

  if (!joinedChannel) return;
  const maxUsers = joinedChannel.userLimit;
  const bitrate = joinedChannel.bitrate;

  if (!newState.member) return;

  const channelNumber = await fetchChannelNumber(category.id);

  const newChannelName = vc.useSequentialNames
    ? `${vc.channelName} #${channelNumber}`
    : `- ${newState.member.displayName}'s VC`;

  try {
    var newChannel = await newState.guild.channels.create({
      name: newChannelName,
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles],
        },
      ],
      userLimit: maxUsers,
      bitrate: bitrate,
    });

    const { data: _, error: channelMoveError } = await tryCatch(newState.setChannel(newChannel));

    if (channelMoveError) {
      log.error(`Failed to move user to new channel, they probably left.. Too fast for me lol`);
      log.error(channelMoveError);
      await newChannel.delete("Failed to move user to new channel.");
      return;
    }

    setChannelNumberCache(category.id, channelNumber + 1);

    const buttons = [
      new ButtonBuilder()
        .setCustomId(`${interactionDeleteVC_REQUEST}-${newChannel.id}`)
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId(`${interactionRenameVC}-${newChannel.id}`)
        .setLabel("Rename")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
      new ButtonBuilder()
        .setCustomId(`${interactionSendInvite}-${newChannel.id}`)
        .setLabel("Invite")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📨"),
      new ButtonBuilder()
        .setCustomId(`${interactionPostBanMenu}-${newChannel.id}`)
        .setLabel("Ban")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔨"),
      new ButtonBuilder()
        .setCustomId(`${interactionLimitUsers}-${newChannel.id}`)
        .setLabel("Limit")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔢"),
      new ButtonBuilder()
        .setCustomId(`${interactionLockVC}-${newChannel.id}`)
        .setLabel("Lock / Unlock")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔒"),
    ];
    newChannel.send({
      content: `<@${newState.id}>`,
      embeds: [
        BasicEmbed(
          client,
          "🎉 Welcome to Your Temporary Voice Channel!",
          `**Channel Owner:** <@${newState.id}>\n**Created:** <t:${Math.floor(
            Date.now() / 1000
          )}:R>\n\n**🔧 Quick Setup Tips:**\n• Right-click the channel name to change settings manually\n• Use the buttons below for quick actions\n• Channel will be automatically deleted when empty`,
          [
            {
              name: "🗑️ Delete Channel",
              value: "Permanently remove this channel with confirmation",
              inline: false,
            },
            {
              name: "📝 Rename Channel",
              value: "Change the channel name to something custom",
              inline: false,
            },
            {
              name: "📨 Create Invite",
              value:
                "Generate a 10-minute invite link (max 10 uses & only works when the channel is public)",
              inline: false,
            },
            {
              name: "🔨 Ban Users",
              value: "Remove and ban specific users from this channel",
              inline: false,
            },
            {
              name: "🔢 Set User Limit",
              value: "Configure maximum number of users allowed",
              inline: false,
            },
            {
              name: "🔒 Lock/Unlock Channel",
              value: "Toggle public channel access",
              inline: false,
            },
            {
              name: "ℹ️ Channel Info",
              value: `**Type:** Temporary Voice Channel\n**Auto-delete:** When empty\n**Permissions:** You have full control`,
              inline: false,
            },
            {
              name: "💡 Pro Tips",
              value: `• Right-click channel name for Discord's built-in settings\n• Channel survives as long as someone is connected\n• Drag users into the channel to invite them`,
              inline: false,
            },
          ],
          "#7289da"
        ),
      ],
      components: ButtonWrapper(buttons, false),
    });

    const db = new Database();
    await db.addToSet(ActiveTempChannels, { guildID: guildId }, "channelIDs", newChannel.id);
  } catch (error) {
    log.error(error as string);
  }
};

export function getChannelNumberCacheKey(categoryId: string) {
  return `tempvc-${categoryId}-channelNum`;
}

export async function fetchChannelNumber(categoryId: string) {
  const number = await redisClient.get(getChannelNumberCacheKey(categoryId));

  if (!number || isNaN(parseInt(number))) {
    return 1;
  }

  return parseInt(number);
}

export async function setChannelNumberCache(categoryId: string, channelNumber?: number) {
  const currentChannelNumber = channelNumber ? channelNumber : await fetchChannelNumber(categoryId);
  return redisClient.set(getChannelNumberCacheKey(categoryId), currentChannelNumber.toString());
}
