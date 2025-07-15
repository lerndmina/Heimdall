import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { SlashCommandProps } from "commandkit";
import ModmailMessageService from "../../services/ModmailMessageService";
import BasicEmbed from "../../utils/BasicEmbed";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";

export const data = new SlashCommandBuilder()
  .setName("modmail-history")
  .setDescription("View message history for a modmail thread")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user whose modmail history to view")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of recent messages to show (default: 10, max: 50)")
      .setMinValue(1)
      .setMaxValue(50)
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Filter by message type")
      .addChoices(
        { name: "All", value: "all" },
        { name: "User messages only", value: "user" },
        { name: "Staff messages only", value: "staff" }
      )
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel);

export async function run({ interaction, client }: SlashCommandProps) {
  const targetUser = interaction.options.getUser("user");
  const limit = interaction.options.getInteger("limit") || 10;
  const type = interaction.options.getString("type") || "all";

  await interaction.deferReply({ ephemeral: true });

  const messageService = new ModmailMessageService();
  const db = new Database();

  try {
    let userId: string;

    // If we have a target user, use their ID
    if (targetUser) {
      userId = targetUser.id;
    } else {
      // Try to find the modmail thread based on the current channel
      const modmail = await db.findOne(Modmail, { forumThreadId: interaction.channelId });
      if (!modmail) {
        return interaction.editReply({
          embeds: [
            BasicEmbed(
              client,
              "Error",
              "This command must be used in a modmail thread or you must specify a user.",
              undefined,
              "Red"
            ),
          ],
        });
      }
      userId = modmail.userId;
    }

    // Get messages based on type filter
    let messages;
    if (type === "all") {
      messages = await messageService.getRecentMessages(userId, limit);
    } else {
      messages = await messageService.getMessagesByType(userId, type as "user" | "staff", limit);
    }

    if (!messages || messages.length === 0) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "No Messages",
            "No messages found for this modmail thread.",
            undefined,
            "Yellow"
          ),
        ],
      });
    }

    // Create embed with message history
    const embed = new EmbedBuilder()
      .setTitle(`Modmail History ${targetUser ? `for ${targetUser.displayName}` : ""}`)
      .setColor("#0099ff")
      .setTimestamp()
      .setFooter({
        text: `Showing ${messages.length} message(s) | ${
          type !== "all" ? `${type} messages only` : "All messages"
        }`,
        iconURL: client.user.displayAvatarURL(),
      });

    // Add messages as fields
    const fields = messages.slice(-limit).map((msg, index) => {
      const displayMessage = messageService.getDisplayMessage(msg);
      const timestamp = `<t:${Math.floor(displayMessage.timestamp.getTime() / 1000)}:R>`;

      let fieldName = `${index + 1}. ${displayMessage.author.name} (${msg.type})`;
      if (displayMessage.isDeleted) fieldName += " [DELETED]";
      if (displayMessage.isEdited) fieldName += " [EDITED]";

      let fieldValue = displayMessage.content;

      // Truncate long messages
      if (fieldValue.length > 1000) {
        fieldValue = fieldValue.substring(0, 997) + "...";
      }

      fieldValue += `\n*${timestamp}*`;

      return {
        name: fieldName,
        value: fieldValue,
        inline: false,
      };
    });

    // Discord has a limit of 25 fields per embed
    const maxFields = Math.min(fields.length, 25);
    embed.addFields(fields.slice(-maxFields));

    // Add summary
    const totalCount = await messageService.getMessageCount(userId);
    embed.setDescription(
      `**Total messages in thread:** ${totalCount}\n` +
        `**Message types:** ${type === "all" ? "All" : type}\n` +
        `**Showing:** Last ${Math.min(limit, messages.length)} messages`
    );

    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Error fetching modmail history:", error);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "Error",
          "An unexpected error occurred while fetching message history.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}
