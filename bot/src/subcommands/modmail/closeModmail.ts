import { ChannelType, SlashCommandBuilder, ThreadChannel } from "discord.js";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { waitingEmoji } from "../../Bot";
import { ThingGetter } from "../../utils/TinyUtils";
import { CommandOptions, SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import { initialReply } from "../../utils/initialReply";
import { closeModmailThreadSafe } from "../../utils/modmail/ModmailThreads";
import { tryCatch } from "../../utils/trycatch";

/**
 * Enhanced modmail close command using centralized closing utility
 * - Uses the centralized closeModmailThreadSafe function
 * - Improved error handling and user feedback
 * - Consistent behavior across all close operations
 */
export default async function ({ interaction, client, handler }: SlashCommandProps) {
  if (!interaction.channel) {
    log.error("Request made to slash command without required values - close.ts");
    return interaction.reply({
      embeds: [ModmailEmbeds.invalidContext(client)],
      ephemeral: true,
    });
  }

  const getter = new ThingGetter(client);
  const reason = interaction.options.getString("reason") || "No reason provided";

  // Find modmail with improved error handling
  const { data: mail, error: mailError } = await tryCatch(
    (async () => {
      let mail = await Modmail.findOne({ forumThreadId: interaction.channel!.id, isClosed: false });
      if (!mail && interaction.channel!.type === ChannelType.DM) {
        mail = await Modmail.findOne({ userId: interaction.user.id, isClosed: false });
      }
      return mail;
    })()
  );

  if (mailError) {
    log.error("Failed to find modmail:", mailError);
    return interaction.reply({
      embeds: [ModmailEmbeds.databaseError(client)],
      ephemeral: true,
    });
  }

  if (!mail) {
    return interaction.reply({
      embeds: [ModmailEmbeds.notModmailThread(client)],
      ephemeral: true,
    });
  }

  const { error: replyError } = await tryCatch(initialReply(interaction, true));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  // Determine if it's the user or a staff member closing the thread
  const isUser = mail.userId === interaction.user.id;
  const closedBy = isUser ? "User" : "Staff";

  // Get user info with error handling
  const { data: user, error: userError } = await tryCatch(getter.getUser(mail.userId));
  const closedByName = isUser ? user?.username || "Unknown User" : interaction.user.username;

  if (userError) {
    log.warn("Failed to get user info for close message:", userError);
  }

  // Use the centralized close utility
  const { data: closeResult, error: closeError } = await tryCatch(
    closeModmailThreadSafe(client, {
      threadId: mail.forumThreadId,
      reason,
      closedBy: {
        type: closedBy as "User" | "Staff",
        username: closedByName,
        userId: interaction.user.id,
      },
      lockAndArchive: true,
      sendCloseMessage: true,
      updateTags: true,
    })
  );

  if (closeError) {
    log.error("Failed to close modmail thread:", closeError);
    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Close Error",
          "Failed to close the modmail thread. Please try again or contact support."
        ),
      ],
    });
  }

  if (!closeResult?.success) {
    log.error("Close operation failed:", closeResult?.error);
    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Close Error",
          closeResult?.error || "Unknown error occurred while closing the thread."
        ),
      ],
    });
  }

  // Send success message
  const { error: successError } = await tryCatch(
    interaction.editReply({
      embeds: [ModmailEmbeds.threadClosedSuccess(client, reason, closedBy, closedByName)],
    })
  );

  if (successError) {
    log.error("Failed to send success message:", successError);
  }
}
