import { SlashCommandBuilder, EmbedBuilder, userMention, ForumChannel } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import ModmailConfig from "../../models/ModmailConfig";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import ModmailCache from "../../utils/ModmailCache";
import { tryCatch } from "../../utils/trycatch";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import { validateForumChannel, validateDescription } from "../../utils/modmail/ModmailValidation";

export const setupModmailOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Setup modmail system for a server
 * - Creates webhook for message relaying
 * - Configures forum channel and staff role
 * - Stores configuration in database
 * - Enhanced error handling with tryCatch utility
 */
export default async function setupModmail({ interaction, client, handler }: SlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");
  const description = interaction.options.getString("description");

  // Validate required parameters
  if (!channel || !role) {
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Missing Parameters",
          "You must provide a channel and role to setup modmail."
        ),
      ],
    });
  }

  // Validate channel type
  const channelValidation = validateForumChannel(channel);
  if (!channelValidation.success) {
    return interaction.editReply({
      content: "",
      embeds: [ModmailEmbeds.error(client, "Invalid Channel Type", channelValidation.error!)],
    });
  }
  const forumChannel = channelValidation.data!;

  // Validate description length
  const descriptionValidation = validateDescription(description);
  if (!descriptionValidation.success) {
    return interaction.editReply({
      content: "",
      embeds: [ModmailEmbeds.error(client, "Description Too Long", descriptionValidation.error!)],
    });
  }
  const validDescription = descriptionValidation.data;

  // Create webhook for the server
  const { data: webhook, error: webhookError } = await tryCatch(
    forumChannel.createWebhook({
      name: "Modmail System",
      avatar: client.user.displayAvatarURL(),
      reason: "Modmail system webhook for relaying user messages",
    })
  );

  if (webhookError) {
    log.error("Failed to create webhook:", webhookError);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Webhook Creation Failed",
          "Failed to create webhook for modmail system. Please ensure the bot has the necessary permissions."
        ),
      ],
    });
  }

  // Update database configuration
  const db = new Database();
  const { data: config, error: dbError } = await tryCatch(
    db.findOneAndUpdate(
      ModmailConfig,
      { guildId: interaction.guild?.id },
      {
        guildId: interaction.guild?.id,
        guildDescription: validDescription,
        forumChannelId: forumChannel.id,
        staffRoleId: role.id,
        webhookId: webhook.id,
        webhookToken: webhook.token,
      },
      { upsert: true, new: true }
    )
  );

  if (dbError) {
    log.error("Failed to update modmail config:", dbError);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Database Error",
          "Failed to save modmail configuration. Please try again."
        ),
      ],
    });
  }

  // Invalidate cache after config update
  if (interaction.guild?.id) {
    const { error: cacheError } = await tryCatch(
      ModmailCache.invalidateModmailConfig(interaction.guild.id)
    );
    if (cacheError) {
      log.warn("Failed to invalidate modmail cache:", cacheError);
    }
  }

  // Send success message
  await interaction.editReply({
    content: "",
    embeds: [
      ModmailEmbeds.success(
        client,
        "Modmail Setup Complete",
        `Modmail has been setup successfully! The forum channel ${forumChannel} will be used for modmail threads and the role ${role} will be pinged when a new thread is created.${
          validDescription ? `\n\nDescription: ${validDescription}` : ""
        }`
      ),
    ],
  });
}
