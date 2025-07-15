import {
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import Database from "../../utils/data/database";
import ModeratedChannel, { ModerationCategory } from "../../models/ModeratedChannels";
import log from "../../utils/log";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("moderation-list")
  .setDescription("List all channels with moderation enabled in this guild")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);

  try {
    const { guild } = interaction;

    if (!guild) {
      return interaction.editReply("This command can only be used in a server.");
    }

    const db = new Database();
    const moderatedChannels = await db.find(ModeratedChannel, { guildId: guild.id }, true);

    if (!moderatedChannels || !moderatedChannels.length) {
      return interaction.editReply("No channels with moderation enabled found in this server.");
    }

    // Find server-wide default settings if they exist
    const guildDefaults = moderatedChannels.find((channel) => channel.isGuildDefault === true);

    // Separate channel-specific settings
    const channelSpecificSettings = moderatedChannels.filter((channel) => !channel.isGuildDefault);

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle("Moderation Settings")
      .setColor("#5865F2")
      .setDescription(
        `Found ${channelSpecificSettings.length} channel(s) with specific moderation settings${
          guildDefaults ? " and server-wide default settings" : ""
        }.`
      )
      .setTimestamp();

    // First add server-wide default settings if they exist
    if (guildDefaults && guildDefaults.isEnabled) {
      const allCategories = Object.values(ModerationCategory);
      let defaultValue = "";

      if (guildDefaults.modlogChannelId) {
        defaultValue += `**Reports sent to:** <#${guildDefaults.modlogChannelId}>\n`;
      }

      // Add categories info if specific categories are set
      if (
        guildDefaults.moderationCategories &&
        guildDefaults.moderationCategories.length < allCategories.length
      ) {
        defaultValue += `**Categories:** ${guildDefaults.moderationCategories.join(", ")}\n`;
      }

      embed.addFields({
        name: "🌐 Server-Wide Default Settings",
        value: defaultValue || "All moderation categories enabled",
      });
    }

    // Group channels by modlog for channel-specific settings
    const channelGroups: Record<
      string,
      {
        channels: string[];
        categories: string[];
      }
    > = {};

    // Get all available moderation categories
    const allCategories = Object.values(ModerationCategory);

    // Populate channel groups
    for (const channel of channelSpecificSettings) {
      if (!channel.channelId) continue; // Skip if no channelId, happens if there's a guild default

      const modlogKey = channel.modlogChannelId || "no-modlog";
      if (!channelGroups[modlogKey]) {
        channelGroups[modlogKey] = {
          channels: [],
          categories: [],
        };
      }

      // Add channel to group
      channelGroups[modlogKey].channels.push(channel.channelId);

      // Store categories if they're not the default (all categories)
      if (
        channel.moderationCategories &&
        channel.moderationCategories.length < allCategories.length
      ) {
        channelGroups[modlogKey].categories = channel.moderationCategories;
      }
    }

    // Add fields for each modlog group for channel-specific settings
    if (Object.keys(channelGroups).length > 0) {
      // Add a separator if we have both default and channel-specific settings
      if (guildDefaults && guildDefaults.isEnabled) {
        embed.addFields({
          name: "Channel-Specific Settings",
          value:
            "The following channels have their own moderation settings, overriding the server defaults:",
        });
      }

      for (const [modlogId, group] of Object.entries(channelGroups)) {
        const modlogName = modlogId === "no-modlog" ? "*No modlog channel set*" : `<#${modlogId}>`;

        const channelsList = group.channels.map((channelId) => `<#${channelId}>`).join(", ");

        let fieldValue = channelsList;

        // Add categories info if specific categories are set
        if (group.categories.length > 0) {
          fieldValue += `\n**Categories:** ${group.categories.join(", ")}`;
        }

        embed.addFields({
          name: `📋 Reporting to ${modlogName}`,
          value: fieldValue,
        });
      }
    }

    // Add note for channels using defaults
    if (guildDefaults && guildDefaults.isEnabled) {
      const channelsWithSpecificSettings = new Set(channelSpecificSettings.map((c) => c.channelId));

      // Get all text channels in the guild
      const guildTextChannels =
        interaction.guild?.channels.cache.filter(
          (c) => c.isTextBased() && !c.isVoiceBased() && !c.isThread()
        ).size || 0;

      const channelsUsingDefaults = guildTextChannels - channelsWithSpecificSettings.size;

      if (channelsUsingDefaults > 0) {
        embed.addFields({
          name: "ℹ️ Channels Using Default Settings",
          value: `${channelsUsingDefaults} other text channel(s) are using server-wide default settings.`,
        });
      }
    }

    return interaction.editReply({ embeds: [embed], content: null });
  } catch (error) {
    log.error("Error in moderation-list command:", error);
    return interaction.editReply("An error occurred while fetching moderated channels.");
  }
}
