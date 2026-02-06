/**
 * Edit Tracker - Track message edits in modmail conversations
 *
 * Handles:
 * - User edits in DM → update DB and relay to thread
 * - Staff edits in thread → update DB and relay to DM
 * - Fetching partial messages
 */

import { Events, Message, type PartialMessage } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../../index.js";
import Modmail, { ModmailStatus, type IModmail, type ModmailMessage } from "../../models/Modmail.js";
import type { Document } from "mongoose";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:edit-tracker");

export const event = Events.MessageUpdate;
export const pluginName = "modmail";

/**
 * Main event handler
 */
export async function execute(client: HeimdallClient, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
  // Skip bot messages
  if (newMessage.author?.bot) return;

  // Fetch full message if partial
  let message: Message;
  if (newMessage.partial) {
    try {
      message = await newMessage.fetch();
    } catch (error) {
      log.debug(`Failed to fetch partial message ${newMessage.id}:`, error);
      return;
    }
  } else {
    message = newMessage as Message;
  }

  // Skip if content didn't actually change
  if (oldMessage.content === message.content) return;

  const pluginAPI = getPluginAPI(client);
  if (!pluginAPI) {
    log.debug("Modmail plugin API not available");
    return;
  }

  try {
    // Determine context: DM (user edit) or Thread (staff edit)
    if (!message.guild) {
      // DM message - user edit
      await handleUserEdit(client, pluginAPI, message);
    } else if (message.channel.isThread()) {
      // Thread message - staff edit
      await handleStaffEdit(client, pluginAPI, message);
    }
  } catch (error) {
    log.error(`Error handling message edit for ${message.id}:`, error);
  }
}

/**
 * Find a message in modmail history, update its content, and save.
 * Shared logic for both user edits (DM side) and staff edits (thread side).
 *
 * @returns The updated message entry if found and updated, or null if not found.
 */
async function findAndRecordEdit(modmail: IModmail, messageId: string, newContent: string, isThread: boolean): Promise<ModmailMessage | null> {
  const fieldName = isThread ? "discordMessageId" : "discordDmMessageId";
  const modmailId = modmail.modmailId as string;

  const messageIndex = modmail.messages.findIndex((m: ModmailMessage) => m[fieldName] === messageId);
  if (messageIndex === -1) {
    log.debug(`Message ${messageId} not found in modmail ${modmailId} history`);
    return null;
  }

  const messageEntry = modmail.messages[messageIndex];
  if (!messageEntry) {
    log.debug(`Message entry at index ${messageIndex} is undefined`);
    return null;
  }

  // Store original content if not already stored
  if (!messageEntry.originalContent) {
    messageEntry.originalContent = messageEntry.content;
  }

  // Update the message
  messageEntry.content = newContent;
  messageEntry.isEdited = true;
  messageEntry.editedAt = new Date();

  const modmailDoc = modmail as IModmail & Document;
  await modmailDoc.save();

  return messageEntry;
}

/**
 * Handle user message edit in DM
 */
async function handleUserEdit(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message): Promise<void> {
  // Find modmail with this DM message
  const modmail = await Modmail.findOne({
    userId: message.author.id,
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordDmMessageId": message.id,
  });

  if (!modmail) return;

  const messageEntry = await findAndRecordEdit(modmail, message.id, message.content, false);
  if (!messageEntry) return;

  log.debug(`Recorded user edit for message ${message.id} in modmail ${modmail.modmailId}`);
  await relayEditIndicatorToThread(client, pluginAPI, modmail, messageEntry, message.content);
}

/**
 * Handle staff message edit in thread
 */
async function handleStaffEdit(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message): Promise<void> {
  // Find modmail with this thread
  const modmail = await Modmail.findOne({
    forumThreadId: message.channel.id,
    status: { $ne: ModmailStatus.CLOSED },
    "messages.discordMessageId": message.id,
  });

  if (!modmail) return;

  const messageEntry = await findAndRecordEdit(modmail, message.id, message.content, true);
  if (!messageEntry) return;

  // Staff-only messages were never relayed — no need to notify user
  if (messageEntry.isStaffOnly) {
    log.debug(`Updated staff-only message edit in modmail ${modmail.modmailId}`);
    return;
  }

  log.debug(`Recorded staff edit for message ${message.id} in modmail ${modmail.modmailId}`);
  await relayEditIndicatorToUser(client, pluginAPI, modmail, messageEntry, message.content);
}

/**
 * Relay edit indicator to thread (when user edits their DM)
 *
 * Edits the webhook message in the thread to show the updated content
 * with the original message shown for staff visibility.
 */
async function relayEditIndicatorToThread(client: HeimdallClient, pluginAPI: ModmailPluginAPI, modmail: IModmail, messageEntry: ModmailMessage, newContent: string): Promise<void> {
  const webhookMessageId = messageEntry.discordMessageId;
  if (!webhookMessageId) {
    log.debug(`No thread message ID for modmail ${modmail.modmailId}, cannot relay edit`);
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
    const editedContent = `${newContent}\n\n-# ✏️ Original: ~~${messageEntry.originalContent}~~`;
    await webhook.editMessage(webhookMessageId, {
      content: editedContent,
      threadId: modmail.forumThreadId as string,
    });
    log.debug(`Relayed user edit to thread for modmail ${modmail.modmailId}`);
  } catch (error) {
    log.error(`Failed to relay user edit to thread for modmail ${modmail.modmailId}:`, error);
  }
}

/**
 * Relay edit indicator to user (when staff edits their thread message)
 *
 * Silently edits the DM message - user just sees the updated content.
 */
async function relayEditIndicatorToUser(client: HeimdallClient, pluginAPI: ModmailPluginAPI, modmail: IModmail, messageEntry: ModmailMessage, newContent: string): Promise<void> {
  const dmMessageId = messageEntry.discordDmMessageId;
  if (!dmMessageId) {
    log.debug(`No DM message ID for modmail ${modmail.modmailId}, cannot relay edit`);
    return;
  }

  try {
    const user = await pluginAPI.lib.thingGetter.getUser(modmail.userId as string);
    if (!user) {
      log.debug(`User ${modmail.userId} not found, cannot relay edit`);
      return;
    }

    const dmChannel = await user.createDM();
    const dmMessage = await dmChannel.messages.fetch(dmMessageId);

    // Get staff display name for the re-formatted message
    const guild = await pluginAPI.lib.thingGetter.getGuild(modmail.guildId as string);
    const staffMember = guild ? await pluginAPI.lib.thingGetter.getMember(guild, messageEntry.authorId) : null;
    const staffUser = await pluginAPI.lib.thingGetter.getUser(messageEntry.authorId);
    const staffName = staffMember ? pluginAPI.lib.thingGetter.getMemberName(staffMember) : staffUser ? pluginAPI.lib.thingGetter.getUsername(staffUser) : "Staff";

    const formattedContent = pluginAPI.flowService.formatStaffReply(newContent, staffName, guild?.name || "the server");
    await dmMessage.edit({ content: formattedContent });

    log.debug(`Relayed staff edit to user DM for modmail ${modmail.modmailId}`);
  } catch (error) {
    log.error(`Failed to relay staff edit to user DM for modmail ${modmail.modmailId}:`, error);
  }
}
