import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import Database from "../../../utils/data/database";
import ModmailConfig from "../../../models/ModmailConfig";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { tryCatch } from "../../../utils/trycatch";
import log from "../../../utils/log";
import { waitingEmoji } from "../../../Bot";
import { EmbedBuilder } from "discord.js";

export const statusTypingOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

/**
 * Show current typing indicator configuration for modmail
 */
export default async function statusTyping({
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

  const isEnabled = config.typingIndicators !== false; // Default to true if not set
  const style = config.typingIndicatorStyle || "native";

  const styleDescriptions = {
    native: "Discord's native typing indicator",
    message: "Visual typing message (auto-deleted after 5 seconds)",
    both: "Both native Discord typing and visual message",
  };

  const statusEmbed = new EmbedBuilder()
    .setTitle("🔄 Typing Indicator Configuration")
    .setColor(isEnabled ? 0x00ff00 : 0xff0000)
    .addFields(
      {
        name: "Status",
        value: isEnabled ? "✅ **Enabled**" : "❌ **Disabled**",
        inline: true,
      },
      {
        name: "Style",
        value: isEnabled ? styleDescriptions[style as keyof typeof styleDescriptions] : "N/A",
        inline: true,
      },
      {
        name: "Description",
        value: isEnabled
          ? "When users type in their DMs with an open modmail, staff will see typing indicators in the modmail thread."
          : "Users typing in their DMs will not show typing indicators in modmail threads.",
        inline: false,
      }
    )
    .setFooter({
      text: `Use /modmail typing ${isEnabled ? "disable" : "enable"} to ${
        isEnabled ? "disable" : "enable"
      } this feature`,
    })
    .setTimestamp();

  return interaction.editReply({
    content: "",
    embeds: [statusEmbed],
  });
}
