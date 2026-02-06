/**
 * Delete Tracker - Track message deletions in modmail conversations
 *
 * Handles:
 * - User deletions in DM → mark as deleted in DB
 * - Staff deletions in thread → mark as deleted in DB
 * - Optionally notify the other side of deletions
 */

import { Events, Message, type PartialMessage } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../../index.js";
import Modmail, { ModmailStatus, type IModmail, type ModmailMessage } from "../../models/Modmail.js";
import type { Document } from "mongoose";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:delete-tracker");

export const event = Events.MessageDelete;
export const pluginName = "modmail";

/**
 * Main event handler
 */
export async function execute(client: HeimdallClient, message: Message | PartialMessage): Promise<void> {
  // Skip bot messages if we can tell
  if (message.author?.bot) return;

  const pluginAPI = getPluginAPI(client);
  if (!pluginAPI) {
    log.debug("Modmail plugin API not available");
    return;
  }

  try {
    // Determine context: DM (user delete) or Thread (staff delete)
    // Note: For partial messages, we may not have guild info, so check both
    if (!message.guild) {
      // Likely a DM message
      await handleUserDelete(client, pluginAPI, message);
    } else if (message.channel && "isThread" in message.channel && message.channel.isThread()) {
      // Thread message
      await handleStaffDelete(client, pluginAPI, message);
    } else {
      // Could still be a DM if we're missing context
      // Try both lookups
      await handlePossibleDelete(client, pluginAPI, message);
    }
  } catch (error) {
    log.error(`Error handling message delete for ${message.id}:`, error);
  }
}

/**
 * Handle user message deletion in DM
 */
async function handleUserDelete(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message | PartialMessage): Promise<void> {
  // Find modmail with this DM message
  const modmail = await Modmail.findOne({
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordDmMessageId": message.id,
  });

  if (!modmail) {
    // Message not part of any active modmail
    return;
  }

  await markMessageAsDeleted(client, pluginAPI, modmail, message.id, false, message.author?.id);
}

/**
 * Handle staff message deletion in thread
 */
async function handleStaffDelete(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message | PartialMessage): Promise<void> {
  // Find modmail with this thread message
  const modmail = await Modmail.findOne({
    forumThreadId: message.channel?.id,
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordMessageId": message.id,
  });

  if (!modmail) {
    // Message not part of any active modmail
    return;
  }

  await markMessageAsDeleted(client, pluginAPI, modmail, message.id, true, message.author?.id);
}

/**
 * Handle potential delete when context is unclear
 * Tries to find the message in either DM or thread records
 */
async function handlePossibleDelete(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message | PartialMessage): Promise<void> {
  // Try DM first
  let modmail = await Modmail.findOne({
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordDmMessageId": message.id,
  });

  if (modmail) {
    await markMessageAsDeleted(client, pluginAPI, modmail, message.id, false, message.author?.id);
    return;
  }

  // Try thread message
  modmail = await Modmail.findOne({
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordMessageId": message.id,
  });

  if (modmail) {
    await markMessageAsDeleted(client, pluginAPI, modmail, message.id, true, message.author?.id);
  }
}

/**
 * Mark a message as deleted in the database
 */
async function markMessageAsDeleted(client: HeimdallClient, pluginAPI: ModmailPluginAPI, modmail: IModmail, messageId: string, isThread: boolean, deletedBy?: string): Promise<void> {
  const modmailId = modmail.modmailId as string;
  const fieldName = isThread ? "discordMessageId" : "discordDmMessageId";

  // Find the message in history
  const messageIndex = modmail.messages.findIndex((m: ModmailMessage) => m[fieldName] === messageId);

  if (messageIndex === -1) {
    log.debug(`Message ${messageId} not found in modmail ${modmailId} history`);
    return;
  }

  // Get the message entry safely
  const messageEntry = modmail.messages[messageIndex];
  if (!messageEntry) {
    log.debug(`Message entry at index ${messageIndex} is undefined`);
    return;
  }

  // Already marked as deleted
  if (messageEntry.isDeleted) {
    return;
  }

  // Mark as deleted
  messageEntry.isDeleted = true;
  messageEntry.deletedAt = new Date();
  if (deletedBy) {
    messageEntry.deletedBy = deletedBy;
  }

  const modmailDoc = modmail as IModmail & Document;
  await modmailDoc.save();

  const context = isThread ? "thread" : "DM";
  log.debug(`Marked message ${messageId} as deleted in modmail ${modmailId} (${context})`);

  // Relay the deletion to the other side
  if (isThread) {
    // Staff deleted a thread message → delete the corresponding DM message
    await relayDeleteToUser(client, pluginAPI, modmail, messageEntry);
  } else {
    // User deleted a DM message → strikethrough the webhook message in thread
    await relayDeleteToThread(client, pluginAPI, modmail, messageEntry);
  }
}

/**
 * Relay deletion to user (when staff deletes their thread message)
 *
 * Deletes the corresponding DM message so the user no longer sees it.
 */
async function relayDeleteToUser(client: HeimdallClient, pluginAPI: ModmailPluginAPI, modmail: IModmail, messageEntry: ModmailMessage): Promise<void> {
  const dmMessageId = messageEntry.discordDmMessageId;
  if (!dmMessageId) {
    log.debug(`No DM message ID for modmail ${modmail.modmailId}, cannot relay delete`);
    return;
  }

  // Staff-only messages were never sent to user — nothing to delete
  if (messageEntry.isStaffOnly) return;

  try {
    const user = await pluginAPI.lib.thingGetter.getUser(modmail.userId as string);
    if (!user) {
      log.debug(`User ${modmail.userId} not found, cannot relay delete`);
      return;
    }

    const dmChannel = await user.createDM();
    const dmMessage = await dmChannel.messages.fetch(dmMessageId);
    await dmMessage.delete();

    log.debug(`Deleted DM message ${dmMessageId} for modmail ${modmail.modmailId}`);
  } catch (error) {
    log.error(`Failed to delete DM message for modmail ${modmail.modmailId}:`, error);
  }
}

/**
 * Relay deletion to thread (when user deletes their DM)
 *
 * Edits the webhook message in the thread to show the content as strikethrough.
 */
async function relayDeleteToThread(client: HeimdallClient, pluginAPI: ModmailPluginAPI, modmail: IModmail, messageEntry: ModmailMessage): Promise<void> {
  const webhookMessageId = messageEntry.discordMessageId;
  if (!webhookMessageId) {
    log.debug(`No thread message ID for modmail ${modmail.modmailId}, cannot relay delete`);
    return;
  }

  const config = await pluginAPI.modmailService.getConfig(modmail.guildId as string);
  if (!config || !modmail.categoryId) {
    log.debug(`Config/category not found for modmail ${modmail.modmailId}`);
    return;
  }

  const webhook = await pluginAPI.modmailService.getWebhook(config, modmail.categoryId as string);
  if (!webhook) {
    log.debug(`Webhook not found for category ${modmail.categoryId}`);
    return;
  }

  try {
    const originalContent = messageEntry.content || "";
    await webhook.editMessage(webhookMessageId, {
      content: `~~${originalContent}~~`,
      threadId: modmail.forumThreadId as string,
    });
    log.debug(`Strikethrough'd user message in thread for modmail ${modmail.modmailId}`);
  } catch (error) {
    log.error(`Failed to relay user delete to thread for modmail ${modmail.modmailId}:`, error);
  }
}
