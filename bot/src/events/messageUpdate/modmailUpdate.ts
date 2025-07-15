import { Message, Client, PartialMessage } from "discord.js";
import ModmailMessageService, {
  ModmailMessageFormatter,
} from "../../services/ModmailMessageService";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";
import log from "../../utils/log";
import { debugMsg, ThingGetter } from "../../utils/TinyUtils";
import { removeMentions } from "../../Bot";
import ModmailCache from "../../utils/ModmailCache";

/**
 * Handle message updates in modmail threads and DMs
 * @param oldMessage - The message before the update
 * @param newMessage - The message after the update
 * @param client - Discord client
 */
export default async function (
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  client: Client<true>
) {
  // Early returns for optimization
  if (newMessage.author?.bot) return;
  if (!newMessage.content) return;
  if (oldMessage.content === newMessage.content) return;

  // Use singleton pattern for better performance
  const messageService = new ModmailMessageService();
  const db = new Database();

  try {
    // Check if this is a DM message update
    if (!newMessage.guildId) {
      await handleDMMessageUpdate(oldMessage, newMessage, messageService, client);
      return;
    }

    // Check if this is a message in a modmail thread
    await handleThreadMessageUpdate(oldMessage, newMessage, messageService, db, client);
  } catch (error) {
    log.error(`Error handling message update: ${error}`);
  }
}

/**
 * Handle message updates in DMs (user editing their modmail messages)
 * Optimized with single database instance and early returns
 */
async function handleDMMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  messageService: ModmailMessageService,
  client: Client<true>
) {
  if (!newMessage.author?.id) return;

  try {
    // Use shared database instance
    const db = new Database();
    const modmail = await db.findOne(Modmail, { userId: newMessage.author.id });
    if (!modmail) return;

    // Find the tracked message by Discord message ID
    const trackedMessage = await messageService.findMessageByDiscordId(
      newMessage.author.id,
      newMessage.id
    );

    if (!trackedMessage) {
      debugMsg(`No tracked message found for DM edit: ${newMessage.id}`);
      return;
    }

    // Process the updated content with forwarded message detection
    const { prepModmailMessage } = await import("../../utils/TinyUtils");
    const processedContent = await prepModmailMessage(client, newMessage as Message, 2000);
    if (!processedContent) return;

    const cleanContent = removeMentions(processedContent);
    await messageService.editMessage(
      newMessage.author.id,
      trackedMessage.messageId,
      cleanContent,
      newMessage.author.id
    );

    log.debug(`Updated DM message ${trackedMessage.messageId} for user ${newMessage.author.id}`);

    // Update the corresponding webhook message in the forum thread
    await updateWebhookMessage(modmail, trackedMessage, cleanContent, client);
    log.debug(`Updated webhook message for tracked message ${trackedMessage.messageId}`);
  } catch (error) {
    log.error(`Error handling DM message update: ${error}`);
  }
}

/**
 * Handle message updates in modmail threads (staff editing their messages)
 */
async function handleThreadMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
  messageService: ModmailMessageService,
  db: Database,
  client: Client<true>
) {
  if (!newMessage.author || !newMessage.channelId) return;

  try {
    // Check if this is a modmail thread
    const modmail = await db.findOne(Modmail, { forumThreadId: newMessage.channelId });
    if (!modmail) return;

    // Skip messages that start with "." (staff-only messages)
    if (newMessage.content?.startsWith(".")) return;

    // Find the tracked message by Discord message ID
    const trackedMessage = await messageService.findMessageByDiscordId(
      modmail.userId,
      newMessage.id
    );

    if (!trackedMessage) {
      debugMsg(`No tracked message found for thread edit: ${newMessage.id}`);
      return;
    }

    // Process the updated content with forwarded message detection
    const { prepModmailMessage } = await import("../../utils/TinyUtils");
    const processedContent = await prepModmailMessage(client, newMessage as Message, 1024);
    if (!processedContent) return;

    // Update the message in our tracking system
    const cleanContent = removeMentions(processedContent);
    await messageService.editMessage(
      modmail.userId,
      trackedMessage.messageId,
      cleanContent,
      newMessage.author.id
    );

    log.debug(
      `Updated thread message ${trackedMessage.messageId} for user ${modmail.userId} by staff ${newMessage.author.id}`
    );

    // Update the corresponding DM message to the user
    await updateDMMessage(modmail, trackedMessage, cleanContent, client);
    log.debug(`Updated DM message for tracked message ${trackedMessage.messageId}`);
  } catch (error) {
    log.error(`Error handling thread message update: ${error}`);
  }
}

/**
 * Update webhook message in forum thread when user edits DM
 * Optimized with cached config
 */
async function updateWebhookMessage(
  modmail: any,
  trackedMessage: any,
  newContent: string,
  client: Client<true>
) {
  try {
    if (!trackedMessage.webhookMessageUrl) {
      log.error("No webhook message URL found for editing");
      return;
    }

    log.debug(`About to edit webhook message with URL: ${trackedMessage.webhookMessageUrl}`);
    log.debug(`Modmail guild ID: ${modmail.guildId}`);
    log.debug(`Tracked message ID: ${trackedMessage.messageId}`);

    // Get webhook credentials from cached config
    const db = new Database();
    const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
    if (!config?.webhookId || !config?.webhookToken) {
      log.error("No webhook credentials found in config for editing");
      return;
    }

    // User messages in webhooks maintain their original format (just the content)
    const formattedContent = ModmailMessageFormatter.formatUserMessageForWebhook(newContent);

    const success = await ModmailMessageService.editMessageFromUrl(
      client,
      trackedMessage.webhookMessageUrl,
      formattedContent,
      config.webhookId,
      config.webhookToken
    );

    if (success) {
      log.debug(`Updated webhook message via URL: ${trackedMessage.webhookMessageUrl}`);
    } else {
      log.error(`Failed to update webhook message via URL: ${trackedMessage.webhookMessageUrl}`);
    }
  } catch (error) {
    log.error(`Failed to update webhook message: ${error}`);
  }
}

/**
 * Update DM message to user when staff edits thread message
 * Optimized with better error handling and caching
 */
async function updateDMMessage(
  modmail: any,
  trackedMessage: any,
  newContent: string,
  client: Client<true>
) {
  try {
    if (!trackedMessage.dmMessageUrl) {
      log.error("No DM message URL found for editing");
      return;
    }

    // Get the staff member information to preserve the original formatting
    const getter = new ThingGetter(client);
    let guild;

    try {
      guild = await getter.getGuild(modmail.guildId);
    } catch (error) {
      log.error(`Could not fetch guild for DM formatting: ${error}`);
      return;
    }

    // Try to get the original staff member who sent the message
    let staffMemberName = trackedMessage.authorName || "Staff Member";

    // If we have the author ID, get their actual name
    if (trackedMessage.authorId) {
      try {
        const staffMember = await getter.getMember(guild, trackedMessage.authorId);
        if (staffMember) {
          staffMemberName = getter.getMemberName(staffMember);
        }
      } catch (error) {
        log.debug(`Could not fetch staff member for DM formatting: ${error}`);
        // Continue with fallback name
      }
    }

    // Preserve the original staff reply formatting
    const formattedContent = ModmailMessageFormatter.formatStaffReplyForDM(
      newContent,
      staffMemberName,
      guild.name
    );

    const success = await ModmailMessageService.editMessageFromUrl(
      client,
      trackedMessage.dmMessageUrl,
      formattedContent
    );

    if (success) {
      log.debug(`Updated DM message via URL: ${trackedMessage.dmMessageUrl}`);
    } else {
      log.error(`Failed to update DM message via URL: ${trackedMessage.dmMessageUrl}`);
    }
  } catch (error) {
    log.error(`Failed to update DM message: ${error}`);
  }
}
