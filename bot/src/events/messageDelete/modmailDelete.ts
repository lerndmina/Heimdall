import { Message, Client, PartialMessage } from "discord.js";
import ModmailMessageService from "../../services/ModmailMessageService";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";
import log from "../../utils/log";
import { debugMsg } from "../../utils/TinyUtils";
import ModmailCache from "../../utils/ModmailCache";

/**
 * Handle message deletions in modmail threads and DMs
 * @param message - The deleted message
 * @param client - Discord client
 */
export default async function (message: Message | PartialMessage, client: Client<true>) {
  // Early returns for optimization
  if (message.author?.bot) return;

  const messageService = new ModmailMessageService();
  const db = new Database();

  try {
    // Check if this is a DM message deletion
    if (!message.guildId) {
      await handleDMMessageDeletion(message, messageService, client);
      return;
    }

    // Check if this is a message in a modmail thread
    await handleThreadMessageDeletion(message, messageService, db, client);
  } catch (error) {
    log.error(`Error handling message deletion: ${error}`);
  }
}

/**
 * Handle message deletions in DMs (user deleting their modmail messages)
 */
async function handleDMMessageDeletion(
  message: Message | PartialMessage,
  messageService: ModmailMessageService,
  client: Client<true>
) {
  if (!message.author) return;

  try {
    // Find the modmail thread for this user
    const db = new Database();
    const modmail = await db.findOne(Modmail, { userId: message.author.id });
    if (!modmail) return;

    // Find the tracked message by Discord message ID
    const trackedMessage = await messageService.findMessageByDiscordId(
      message.author.id,
      message.id
    );

    if (!trackedMessage) {
      debugMsg(`No tracked message found for DM deletion: ${message.id}`);
      return;
    }

    // Mark the message as deleted in our tracking system
    await messageService.deleteMessage(
      message.author.id,
      trackedMessage.messageId,
      message.author.id
    );

    log.debug(
      `Marked DM message ${trackedMessage.messageId} as deleted for user ${message.author.id}`
    );

    // Apply strikethrough to the corresponding webhook message in the forum thread
    await deleteWebhookMessage(modmail, trackedMessage, client);
    log.debug(
      `Applied strikethrough to webhook message for tracked message ${trackedMessage.messageId}`
    );
  } catch (error) {
    log.error(`Error handling DM message deletion: ${error}`);
  }
}

/**
 * Handle message deletions in modmail threads (staff deleting their messages)
 */
async function handleThreadMessageDeletion(
  message: Message | PartialMessage,
  messageService: ModmailMessageService,
  db: Database,
  client: Client<true>
) {
  if (!message.author || !message.channelId) return;

  try {
    // Check if this is a modmail thread
    const modmail = await db.findOne(Modmail, { forumThreadId: message.channelId });
    if (!modmail) return;

    // Skip messages that start with "." (staff-only messages)
    if (message.content?.startsWith(".")) return;

    // Find the tracked message by Discord message ID
    const trackedMessage = await messageService.findMessageByDiscordId(modmail.userId, message.id);

    if (!trackedMessage) {
      debugMsg(`No tracked message found for thread deletion: ${message.id}`);
      return;
    }

    // Mark the message as deleted in our tracking system
    await messageService.deleteMessage(modmail.userId, trackedMessage.messageId, message.author.id);

    log.debug(
      `Marked thread message ${trackedMessage.messageId} as deleted for user ${modmail.userId} by staff ${message.author.id}`
    );

    // Apply strikethrough to the corresponding DM message to the user
    await deleteDMMessage(modmail, trackedMessage, client);
    log.debug(
      `Applied strikethrough to DM message for tracked message ${trackedMessage.messageId}`
    );
  } catch (error) {
    log.error(`Error handling thread message deletion: ${error}`);
  }
}

/**
 * Apply strikethrough to webhook message in forum thread when user deletes DM
 * Optimized with cached config
 */
async function deleteWebhookMessage(modmail: any, trackedMessage: any, client: Client<true>) {
  try {
    if (!trackedMessage.webhookMessageUrl) {
      log.error("No webhook message URL found for deletion");
      return;
    }

    // Get webhook credentials from cached config
    const db = new Database();
    const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
    if (!config?.webhookId || !config?.webhookToken) {
      log.error("No webhook credentials found in config for deletion");
      return;
    }

    // Fetch current message content to apply strikethrough
    const currentMessage = await ModmailMessageService.fetchMessageFromUrl(
      client,
      trackedMessage.webhookMessageUrl
    );
    if (!currentMessage?.content) {
      log.error("Could not fetch current message content for strikethrough");
      return;
    }

    // Remove any existing strikethrough first, then apply new strikethrough
    const cleanContent = currentMessage.content.replace(/~~/g, "");
    const struckContent = `~~${cleanContent}~~ _(deleted)_`;

    const success = await ModmailMessageService.editMessageFromUrl(
      client,
      trackedMessage.webhookMessageUrl,
      struckContent,
      config.webhookId,
      config.webhookToken
    );

    if (success) {
      log.debug(
        `Applied strikethrough to webhook message via URL: ${trackedMessage.webhookMessageUrl}`
      );
    } else {
      log.error(
        `Failed to apply strikethrough to webhook message via URL: ${trackedMessage.webhookMessageUrl}`
      );
    }
  } catch (error) {
    log.error(`Failed to apply strikethrough to webhook message: ${error}`);
  }
}

/**
 * Apply strikethrough to DM message to user when staff deletes thread message
 */
async function deleteDMMessage(modmail: any, trackedMessage: any, client: Client<true>) {
  try {
    if (!trackedMessage.dmMessageUrl) {
      log.error("No DM message URL found for deletion");
      return;
    }

    // Fetch current message content to apply strikethrough
    const currentMessage = await ModmailMessageService.fetchMessageFromUrl(
      client,
      trackedMessage.dmMessageUrl
    );
    if (!currentMessage || !currentMessage.content) {
      log.error("Could not fetch current message content for strikethrough");
      return;
    }

    // Remove any existing strikethrough first, then apply new strikethrough
    const cleanContent = currentMessage.content.replace(/~~/g, "");
    const struckContent = `~~${cleanContent}~~ _(deleted)_`;

    const success = await ModmailMessageService.editMessageFromUrl(
      client,
      trackedMessage.dmMessageUrl,
      struckContent
    );

    if (success) {
      log.debug(`Applied strikethrough to DM message via URL: ${trackedMessage.dmMessageUrl}`);
    } else {
      log.error(
        `Failed to apply strikethrough to DM message via URL: ${trackedMessage.dmMessageUrl}`
      );
    }
  } catch (error) {
    log.error(`Failed to apply strikethrough to DM message: ${error}`);
  }
}
