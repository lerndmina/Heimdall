import type { SlashCommandProps, CommandOptions } from "commandkit";
import {
  ChannelType,
  ForumChannel,
  InteractionContextType,
  SlashCommandBuilder,
  ThreadChannel,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import ModmailConfig, { ModmailStatus } from "../../models/ModmailConfig";
import Modmail from "../../models/Modmail";
import { handleTag } from "../../events/messageCreate/gotMail";
import log from "../../utils/log";

export const data = new SlashCommandBuilder()
  .setName("updatemodmailtags")
  .setDescription("Update modmail tags")
  .setContexts(InteractionContextType.Guild);

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: ["Administrator"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);
  const db = new Database();

  try {
    // Step 1: Find the modmail config for this guild
    const modmailConfig = await db.findOne(ModmailConfig, { guildId: interaction.guildId });
    if (!modmailConfig) {
      return await interaction.editReply({
        content:
          "❌ Error: Modmail is not configured for this server. Please set up modmail first.",
      });
    }

    // Step 2: Check if this is a modmail thread
    const modmail = await db.findOne(Modmail, { forumThreadId: interaction.channelId });
    if (!interaction.channel) {
      return await interaction.editReply({
        content: "❌ Error: This command can only be used in a thread.",
      });
    }

    if (!modmail && !interaction.channel.isThread()) {
      return await interaction.editReply({
        content: "❌ This command must be used in a modmail thread.",
      });
    }

    // Step 3: Fetch the forum channel
    let forumChannel: ForumChannel;
    try {
      const channel = await interaction.guild!.channels.fetch(modmailConfig.forumChannelId);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        return await interaction.editReply({
          content: "❌ The configured forum channel no longer exists or is not a forum channel.",
        });
      }
      forumChannel = channel as unknown as ForumChannel;
    } catch (error) {
      return await interaction.editReply({
        content: `❌ Failed to fetch the forum channel: ${(error as Error).message}`,
      });
    }

    // Step 4: Update the tags
    await interaction.editReply({
      content: `${waitingEmoji} Updating modmail tags...`,
    });

    await handleTag(modmail, modmailConfig, db, interaction.channel as ThreadChannel, forumChannel);

    // Step 5: Confirm success with details
    const status = modmail ? "OPEN" : "CLOSED";
    await interaction.editReply({
      content:
        `✅ Successfully updated tags for this thread!\n\n` +
        `**Current Status:** ${status}\n` +
        `**Forum Channel:** <#${modmailConfig.forumChannelId}>\n` +
        `**Tags Updated:** ${Object.values(ModmailStatus).length} tags`,
    });
  } catch (error) {
    // Log the full error
    log.error("Error in updatemodmailtags command:", error);

    // Send a user-friendly error message
    await interaction.editReply({
      content:
        `❌ An error occurred while updating tags:\n\`\`\`${(error as Error).message}\`\`\`\n` +
        "Please check the logs for more details.",
    });
  }
}
