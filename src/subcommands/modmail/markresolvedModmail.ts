import { ChannelType } from "discord.js";
import Modmail from "../../models/Modmail";
import { SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
import { initialReply } from "../../utils/initialReply";
import { markModmailAsResolved } from "../../utils/ModmailUtils";
import { tryCatch } from "../../utils/trycatch";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import { getModmailByThreadId } from "../../utils/modmail/ModmailThreads";

const env = FetchEnvs();

/**
 * Mark a modmail thread as resolved
 * - Sends resolution message to user with close/continue options
 * - Enhanced error handling and validation
 * - Uses centralized modmail utilities for consistency
 */
export default async function ({ interaction, client }: SlashCommandProps) {
  if (!interaction.channel) {
    log.error("Request made to slash command without required values - markresolved.ts");
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(client, "Invalid Context", "This command requires a channel context"),
      ],
      ephemeral: true,
    });
  }

  // Check if user has staff role
  const hasStaffRole =
    interaction.member?.roles &&
    typeof interaction.member.roles !== "string" &&
    "cache" in interaction.member.roles
      ? interaction.member.roles.cache.has(env.STAFF_ROLE)
      : false;

  if (!hasStaffRole) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Permission Denied",
          "You need to be a staff member to use this command."
        ),
      ],
      ephemeral: true,
    });
  }

  // Find the modmail thread using the utility
  let mail;
  if (interaction.channel.type === ChannelType.DM) {
    const { data: dmMail, error: dmError } = await tryCatch(
      Modmail.findOne({ userId: interaction.user.id })
    );
    if (dmError) {
      log.error("Failed to find DM modmail:", dmError);
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(client, "Database Error", "Failed to find modmail information"),
        ],
        ephemeral: true,
      });
    }
    mail = dmMail;
  } else {
    const mailResult = await getModmailByThreadId(interaction.channel.id);
    if (mailResult.error) {
      return interaction.reply({
        embeds: [ModmailEmbeds.error(client, "Database Error", mailResult.error)],
        ephemeral: true,
      });
    }
    mail = mailResult.modmail;
  }

  if (!mail) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Invalid Context",
          "This command can only be used in a modmail thread."
        ),
      ],
      ephemeral: true,
    });
  }

  // Check if already marked as resolved
  if (mail.markedResolved) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.info(
          client,
          "Already Resolved",
          "This modmail thread has already been marked as resolved."
        ),
      ],
      ephemeral: true,
    });
  }

  // Send initial reply
  const { error: replyError } = await tryCatch(initialReply(interaction, true));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  // Use the centralized function to mark as resolved
  const { data: result, error: resolveError } = await tryCatch(
    markModmailAsResolved(client, mail, interaction.user.username, interaction.user.id)
  );

  if (resolveError) {
    log.error("Failed to mark modmail as resolved:", resolveError);
    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Resolution Failed",
          "An error occurred while marking this thread as resolved."
        ),
      ],
    });
  }

  if (!result?.success) {
    if (result?.alreadyResolved) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.info(
            client,
            "Already Resolved",
            "This modmail thread has already been marked as resolved."
          ),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Resolution Failed",
          result?.error || "An error occurred while marking this thread as resolved."
        ),
      ],
    });
  }

  // Success response
  await interaction.editReply({
    embeds: [
      ModmailEmbeds.success(
        client,
        "Thread Marked as Resolved",
        `This modmail thread has been marked as resolved.\n\n` +
          `The user has been notified and can choose to close the thread or request more help.\n` +
          `The thread will auto-close in 24 hours if no response is received.`,
        [
          {
            name: "Resolved by",
            value: `${interaction.user.username} (${interaction.user.id})`,
            inline: true,
          },
          { name: "Auto-close", value: "24 hours", inline: true },
        ]
      ),
    ],
  });
}
