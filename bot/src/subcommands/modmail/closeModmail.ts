import { ChannelType, ForumChannel, SlashCommandBuilder, ThreadChannel } from "discord.js";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { waitingEmoji } from "../../Bot";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { CommandOptions, SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
import { initialReply } from "../../utils/initialReply";
import { handleTag } from "../../events/messageCreate/gotMail";
import ModmailConfig from "../../models/ModmailConfig";
import { sendModmailCloseMessage } from "../../utils/ModmailUtils";
import ModmailCache from "../../utils/ModmailCache";
import { tryCatch } from "../../utils/trycatch";

const env = FetchEnvs();

/**
 * Enhanced modmail close command with improved error handling
 * - Uses tryCatch utility for consistent error handling
 * - Better user feedback for edge cases
 * - Improved channel and user validation
 * - Enhanced database operation error handling
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

  const { data: forumThread, error: threadError } = await tryCatch(
    getter.getChannel(mail.forumThreadId)
  );

  if (threadError) {
    log.error("Failed to get forum thread:", threadError);
    return interaction.editReply({
      embeds: [ModmailEmbeds.threadError(client)],
    });
  }

  // Send closure message using consistent styling
  const { data: closeMessageResult, error: closeMessageError } = await tryCatch(
    sendModmailCloseMessage(client, mail, closedBy, closedByName, reason)
  );

  if (closeMessageError) {
    log.error("Failed to send close message:", closeMessageError);
    // Continue with closing process even if message fails
  } else {
    log.info(
      `Modmail ${mail._id} closed by ${closedBy} (${closedByName}), DM success: ${closeMessageResult?.dmSuccess}, Thread success: ${closeMessageResult?.threadSuccess}`
    );
  }

  const db = new Database();
  const { data: config, error: configError } = await tryCatch(
    interaction.guildId
      ? ModmailCache.getModmailConfig(interaction.guildId, db)
      : Promise.resolve(null)
  );

  if (configError) {
    log.warn("Failed to get modmail config for tag update:", configError);
  }

  // Update thread tags if config is available
  if (config && forumThread) {
    const { data: forumChannel, error: forumChannelError } = await tryCatch(
      getter.getChannel(config.forumChannelId)
    );

    if (forumChannelError) {
      log.warn("Failed to get forum channel for tag update:", forumChannelError);
    } else if (forumChannel) {
      const { error: tagError } = await tryCatch(
        handleTag(null, config, db, forumThread as ThreadChannel, forumChannel as ForumChannel)
      );

      if (tagError) {
        log.warn("Failed to update thread tags:", tagError);
      }
    }
  }

  // Lock and archive the thread
  if (forumThread && "setLocked" in forumThread) {
    const archiveReason = `${closedBy} closed: ${reason}`;
    const threadChannel = forumThread as ThreadChannel;

    const { error: lockError } = await tryCatch(threadChannel.setLocked(true, archiveReason));
    if (lockError) {
      log.error("Failed to lock thread:", lockError);
    }

    const { error: archiveError } = await tryCatch(threadChannel.setArchived(true, archiveReason));
    if (archiveError) {
      log.error("Failed to archive thread:", archiveError);
      // Send a message to the thread if we can't archive it
      const { error: notificationError } = await tryCatch(
        threadChannel.send(
          "⚠️ **Manual Action Required**\n\nFailed to archive and lock thread automatically. Please do so manually.\nI'm probably missing permissions."
        )
      );
      if (notificationError) {
        log.error("Failed to send manual action notification:", notificationError);
      }
    }
  }

  // Mark thread as closed instead of deleting
  const { error: closeError } = await tryCatch(
    db.findOneAndUpdate(
      Modmail,
      { forumThreadId: forumThread?.id },
      {
        isClosed: true,
        closedAt: new Date(),
        closedBy: interaction.user.id,
        closedReason: reason,
      }
    )
  );
  if (closeError) {
    log.error("Failed to mark modmail as closed in database:", closeError);
  }

  // Clean cache for both simple userId patterns and compound query patterns
  const { error: cacheError1 } = await tryCatch(
    db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`)
  );
  const { error: cacheError2 } = await tryCatch(
    db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`)
  );
  if (cacheError1 || cacheError2) {
    log.warn("Failed to clean cache:", cacheError1 || cacheError2);
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
