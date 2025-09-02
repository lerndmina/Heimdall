import { Client, Typing, ChannelType, EmbedBuilder } from "discord.js";
import type { CommandHandler } from "@heimdall/command-handler";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import { ThingGetter } from "../../utils/TinyUtils";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import { redisClient } from "../../Bot";

/**
 * Handles typing events in DMs for users with open modmail threads
 * Relays typing indicators to the modmail thread so staff can see when users are typing
 * Features:
 * - Discord typing indicator (sendTyping)
 * - Optional visual typing message with auto-deletion
 * - Rate limiting to prevent spam
 * - Guild-level configuration for enabling/disabling
 */
export default async (typing: Typing, client: Client<true>, handler: CommandHandler) => {
  // Check if channel exists and is accessible
  if (!typing.channel) {
    log.debug("Typing event received but channel is not accessible");
    return;
  }

  // Only handle typing in DM channels
  if (typing.channel.type !== ChannelType.DM) return;

  // Don't handle typing from bots
  if (typing.user?.bot) return;

  // Ensure we have a valid user ID
  if (!typing.user?.id) {
    log.debug("Typing event received but user ID is not available");
    return;
  }

  const userId = typing.user.id;
  const db = new Database();

  // Check if this user has an open modmail thread
  const { data: mail, error: mailError } = await tryCatch(
    db.findOne(Modmail, { userId: userId, isClosed: false })
  );

  if (mailError) {
    log.warn("Failed to check for open modmail during typing event:", mailError);
    return;
  }

  // If no open modmail, nothing to relay
  if (!mail) return;

  // Check guild configuration for typing indicators
  const { data: config, error: configError } = await tryCatch(
    db.findOne(ModmailConfig, { guildId: mail.guildId })
  );

  if (configError) {
    log.warn("Failed to get modmail config during typing event:", configError);
    return;
  }

  // If typing indicators are disabled in config, don't relay
  if (config && config.typingIndicators === false) {
    return;
  }

  // Get typing indicator style (default to 'native' if not configured)
  const typingStyle = config?.typingIndicatorStyle || "native";

  // Rate limit typing events per user (max once every 3 seconds)
  const typingKey = `modmail_typing:${userId}`;

  try {
    const existingTyping = await redisClient.get(typingKey);

    if (existingTyping) {
      // Already sent a typing indicator recently, skip
      return;
    }

    // Set rate limit for 3 seconds
    await redisClient.setEx(typingKey, 3, "true");
  } catch (redisError) {
    log.warn("Redis operation failed during typing event, continuing anyway:", redisError);
  }

  // Get the modmail thread
  const getter = new ThingGetter(client);
  const { data: thread, error: threadError } = await tryCatch(
    getter.getChannel(mail.forumThreadId)
  );

  if (threadError || !thread) {
    log.warn("Failed to get modmail thread for typing indicator:", threadError);
    return;
  }

  // Check if it's a forum thread channel
  if (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
    log.warn("Modmail channel is not a thread, cannot send typing indicator");
    return;
  }

  // Send typing indicators based on configuration
  if (typingStyle === "native" || typingStyle === "both") {
    // Send Discord's native typing indicator
    const { error: typingError } = await tryCatch(thread.sendTyping());

    if (typingError) {
      log.warn("Failed to send typing indicator to modmail thread:", typingError);
      // Don't return here, try visual message if configured
    } else {
      log.debug(
        `Sent native typing indicator from ${
          typing.user?.tag || typing.user?.username || userId
        } to modmail thread ${thread.id}`
      );
    }
  }

  if (typingStyle === "message" || typingStyle === "both") {
    // Send a visual typing message that auto-deletes
    const displayName =
      typing.user.displayName || typing.user.username || typing.user.tag || "User";

    const typingEmbed = new EmbedBuilder()
      .setDescription(`💬 **${displayName}** is typing...`)
      .setColor(0x5865f2) // Discord blurple
      .setTimestamp();

    const { data: typingMessage, error: messageError } = await tryCatch(
      thread.send({
        embeds: [typingEmbed],
      })
    );

    if (messageError) {
      log.warn("Failed to send visual typing message to modmail thread:", messageError);
    } else if (typingMessage) {
      // Auto-delete the typing message after 5 seconds
      setTimeout(async () => {
        const { error: deleteError } = await tryCatch(typingMessage.delete());
        if (deleteError) {
          log.debug("Failed to delete typing message (probably already deleted):", deleteError);
        }
      }, 5000);

      log.debug(
        `Sent visual typing message from ${
          typing.user?.tag || typing.user?.username || userId
        } to modmail thread ${thread.id}`
      );
    }
  }
};
