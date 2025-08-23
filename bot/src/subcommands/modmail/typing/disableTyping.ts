import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import Database from "../../../utils/data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { tryCatch } from "../../../utils/trycatch";
import log from "../../../utils/log";
import { waitingEmoji } from "../../../Bot";

export const disableTypingOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

/**
 * Disable typing indicators for modmail threads
 */
export default async function disableTyping({
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

  const db = new Database();

  // Get modmail config
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
        typingIndicators: false,
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

  const successMessage = `Typing indicators have been **disabled** for this server.\n\nUsers typing in their DMs will no longer show typing indicators in modmail threads.`;

  return interaction.editReply({
    content: "",
    embeds: [ModmailEmbeds.success(client, "Typing Indicators Disabled", successMessage)],
  });
}
