import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import Database from "../../../utils/data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { tryCatch } from "../../../utils/trycatch";
import log from "../../../utils/log";
import { waitingEmoji } from "../../../Bot";

export const enableTypingOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

/**
 * Enable typing indicators for modmail threads
 */
export default async function enableTyping({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(
    interaction.reply({ content: waitingEmoji, ephemeral: true })
  );

  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  if (!interaction.guild) {
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(client, "Server Only", "This command can only be used in a server"),
      ],
    });
  }

  const style = interaction.options.getString("style") || "native";
  const db = new Database();

  // Get or create modmail config
  const { data: config, error: configError } = await tryCatch(
    db.findOne(ModmailConfig, { guildId: interaction.guild.id })
  );

  if (configError) {
    log.error("Failed to get modmail config:", configError);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Database Error",
          "Failed to retrieve modmail configuration. Please try again."
        ),
      ],
    });
  }

  if (!config) {
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Modmail Not Configured",
          "Modmail system is not set up for this server. Please run `/modmail setup` first."
        ),
      ],
    });
  }

  // Update the typing indicator settings
  const { error: updateError } = await tryCatch(
    db.findOneAndUpdate(
      ModmailConfig,
      { guildId: interaction.guild.id },
      {
        typingIndicators: true,
        typingIndicatorStyle: style,
      },
      { new: true, upsert: false }
    )
  );

  if (updateError) {
    log.error("Failed to update typing indicator settings:", updateError);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Update Failed",
          "Failed to update typing indicator settings. Please try again."
        ),
      ],
    });
  }

  const styleDescriptions = {
    native: "Discord's native typing indicator",
    message: "Visual typing message (auto-deleted after 5 seconds)",
    both: "Both native Discord typing and visual message",
  };

  const successMessage = `Typing indicators have been **enabled** for this server.\n\n**Style:** ${
    styleDescriptions[style as keyof typeof styleDescriptions]
  }\n\nNow when users type in their DMs with an open modmail, staff will see typing indicators in the modmail thread.`;

  return interaction.editReply({
    content: "",
    embeds: [ModmailEmbeds.success(client, "Typing Indicators Enabled", successMessage)],
  });
}
