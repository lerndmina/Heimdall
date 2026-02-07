/**
 * ModmailFlowService - Handles message relay between user DM and staff thread
 *
 * Manages bidirectional message relay:
 * - User DM → Staff thread (via webhook with user identity)
 * - Staff thread → User DM (with staff attribution)
 * - Staff-only messages (starting with `.`)
 * - Edit and delete tracking
 */

import type { Client, Message, Webhook, User, Attachment } from "discord.js";
import type { ModmailService } from "./ModmailService.js";
import Modmail, { type IModmail, ModmailStatus, MessageType, MessageContext, type ModmailMessage, type MessageAttachment } from "../models/Modmail.js";
import type { IModmailConfig, ModmailCategory } from "../models/ModmailConfig.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { LibAPI } from "../../lib/index.js";
import type { Document } from "mongoose";
import { nanoid } from "nanoid";

/** Discord DM file size limit for bots (8 MB) */
const DM_FILE_SIZE_LIMIT = 8 * 1024 * 1024;

/** Format bytes into a human-readable size string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Data for adding a message to modmail history
 */
interface AddMessageData {
  authorId: string;
  authorType: MessageType;
  context: MessageContext;
  content?: string;
  discordMessageId?: string;
  discordDmMessageId?: string;
  isStaffOnly?: boolean;
  attachments?: MessageAttachment[];
}

/**
 * ModmailFlowService - Message relay between DM and thread
 */
export class ModmailFlowService {
  constructor(
    private client: Client,
    private modmailService: ModmailService,
    private lib: LibAPI,
    private logger: PluginLogger,
  ) {}

  /**
   * Relay a user's DM message to the modmail thread via webhook
   * @param modmailId - The modmail ID
   * @param message - The Discord message from the user's DM
   * @param sanitizedContent - Optional sanitized content (with mentions stripped). If not provided, raw message.content is used.
   * @returns true if successfully relayed
   */
  async relayUserMessageToThread(modmailId: string, message: Message, sanitizedContent?: string): Promise<boolean> {
    const modmail = await Modmail.findOne({ modmailId });
    if (!modmail || !modmail.forumThreadId || modmail.forumThreadId === "pending") {
      this.logger.warn(`Cannot relay message: modmail ${modmailId} not found or thread pending`);
      return false;
    }

    if (modmail.status === ModmailStatus.CLOSED) {
      this.logger.warn(`Cannot relay message: modmail ${modmailId} is closed`);
      return false;
    }

    const config = await this.modmailService.getConfig(modmail.guildId as string);
    if (!config || !modmail.categoryId) {
      this.logger.warn(`Cannot relay message: config or category not found for modmail ${modmailId}`);
      return false;
    }

    // Get webhook for category
    const webhook = await this.modmailService.getWebhook(config, modmail.categoryId as string);
    if (!webhook) {
      this.logger.error(`Cannot relay message: webhook not found for category ${modmail.categoryId}`);
      return false;
    }

    const user = await this.lib.thingGetter.getUser(modmail.userId as string);

    // Use sanitized content if provided, otherwise fall back to raw content
    const contentToSend = sanitizedContent ?? message.content;

    // Process attachments with size checking
    const allAttachments = [...message.attachments.values()];
    const attachments = this.processAttachments(message.attachments.values());
    const maxSizeBytes = ((config as any).maxAttachmentSizeMB ?? 25) * 1024 * 1024;
    const attachmentsAllowed = (config as any).allowAttachments !== false;

    const validAttachmentUrls: string[] = [];
    const oversizedWarnings: string[] = [];

    for (const attachment of allAttachments) {
      if (!attachmentsAllowed) {
        oversizedWarnings.push(`• **${attachment.name}** – attachments are disabled for this server`);
        continue;
      }
      if (attachment.size > maxSizeBytes) {
        oversizedWarnings.push(`• **${attachment.name}** (${formatFileSize(attachment.size)}) exceeds the **${(config as any).maxAttachmentSizeMB ?? 25} MB** limit`);
        continue;
      }
      validAttachmentUrls.push(attachment.url);
    }

    try {
      // Send via webhook with user identity (using sanitized content to prevent mass mention pings)
      const webhookMessage = await webhook.send({
        content: contentToSend || undefined,
        username: modmail.userDisplayName as string,
        avatarURL: user?.displayAvatarURL(),
        embeds: message.embeds.length > 0 ? message.embeds : undefined,
        files: validAttachmentUrls.length > 0 ? validAttachmentUrls : undefined,
        threadId: modmail.forumThreadId as string,
      });

      // Post a staff-only warning if any attachments were skipped
      if (oversizedWarnings.length > 0) {
        await webhook
          .send({
            content: `⚠️ The following attachment(s) from the user could not be forwarded:\n${oversizedWarnings.join("\n")}`,
            threadId: modmail.forumThreadId as string,
          })
          .catch(() => {});
      }

      // Add to message history (store original content for accurate records)
      await this.addMessageToModmail(modmail, {
        authorId: modmail.userId as string,
        authorType: MessageType.USER,
        context: MessageContext.BOTH,
        content: message.content || undefined,
        discordMessageId: webhookMessage.id,
        discordDmMessageId: message.id,
        attachments,
      });

      // Update last user activity and reset inactivity warning
      modmail.lastUserActivityAt = new Date();
      modmail.autoCloseWarningAt = null as any;
      await modmail.save();
      return true;
    } catch (error) {
      this.logger.error(`Failed to relay user message to thread for modmail ${modmailId}:`, error);
      return false;
    }
  }

  /**
   * Relay a staff's thread message to the user's DM
   * @param modmailId - The modmail ID
   * @param message - The Discord message from the thread
   * @param staffUser - The staff member who sent the message
   * @returns true if successfully relayed
   */
  async relayThreadMessageToUser(modmailId: string, message: Message, staffUser: User): Promise<boolean> {
    const modmail = await Modmail.findOne({ modmailId });
    if (!modmail) {
      this.logger.warn(`Cannot relay message: modmail ${modmailId} not found`);
      return false;
    }

    if (modmail.status === ModmailStatus.CLOSED) {
      this.logger.warn(`Cannot relay message: modmail ${modmailId} is closed`);
      return false;
    }

    // Check for staff-only message (ends with .)
    if (this.isStaffOnlyMessage(message.content)) {
      await message.react("🔒").catch(() => {}); // Staff-only indicator

      // Add to history as staff-only
      await this.addMessageToModmail(modmail, {
        authorId: staffUser.id,
        authorType: MessageType.STAFF,
        context: MessageContext.THREAD,
        content: message.content,
        isStaffOnly: true,
        discordMessageId: message.id,
        attachments: this.processAttachments(message.attachments.values()),
      });

      // Update last staff activity and reset inactivity warning
      modmail.lastStaffActivityAt = new Date();
      modmail.autoCloseWarningAt = null as any;
      await modmail.save();
      return true;
    }

    // Get user to DM
    const user = await this.lib.thingGetter.getUser(modmail.userId as string);
    if (!user) {
      await message.react("❌").catch(() => {});
      await message.reply({ content: "❌ Could not find user to DM." }).catch(() => {});
      return false;
    }

    // Get staff display name
    const guild = await this.lib.thingGetter.getGuild(modmail.guildId as string);
    const staffMember = guild ? await this.lib.thingGetter.getMember(guild, staffUser.id) : null;
    const staffName = staffMember ? this.lib.thingGetter.getMemberName(staffMember) : this.lib.thingGetter.getUsername(staffUser);

    // Format the reply for the user
    const formattedContent = this.formatStaffReply(message.content, staffName, guild?.name || "the server");

    // Get attachments and filter by DM file size limit (8MB for bots)
    const allAttachments = [...message.attachments.values()];
    const attachmentData = this.processAttachments(message.attachments.values());

    const validAttachments = allAttachments.filter((a) => a.size <= DM_FILE_SIZE_LIMIT);
    const oversizedAttachments = allAttachments.filter((a) => a.size > DM_FILE_SIZE_LIMIT);

    // Warn staff about oversized attachments that can't be relayed
    if (oversizedAttachments.length > 0) {
      const fileList = oversizedAttachments.map((a) => `• **${a.name}** (${formatFileSize(a.size)})`).join("\n");
      await message
        .reply({
          content: `⚠️ The following attachment(s) exceed the **8 MB** DM file size limit and will **not** be sent to the user:\n${fileList}`,
        })
        .catch(() => {});
    }

    // If there's nothing to send (no original text, no embeds, and no valid attachments), just warn and return
    const hasContent = message.content.trim().length > 0;
    const hasEmbeds = message.embeds.length > 0;
    if (!hasContent && !hasEmbeds && validAttachments.length === 0) {
      await message.react("⚠️").catch(() => {});
      this.logger.debug(`No relayable content for modmail ${modmailId} (all attachments oversized)`);
      return false;
    }

    try {
      const dm = await user.send({
        content: formattedContent,
        embeds: hasEmbeds ? message.embeds : undefined,
        files: validAttachments,
      });

      // React with partial indicator if some attachments were skipped
      await message.react(oversizedAttachments.length > 0 ? "⚠️" : "📨").catch(() => {});

      // Add to history (record ALL attachments for completeness)
      await this.addMessageToModmail(modmail, {
        authorId: staffUser.id,
        authorType: MessageType.STAFF,
        context: MessageContext.BOTH,
        content: message.content,
        discordMessageId: message.id,
        discordDmMessageId: dm.id,
        attachments: attachmentData,
      });

      // Update last staff activity and reset inactivity warning
      modmail.lastStaffActivityAt = new Date();
      modmail.autoCloseWarningAt = null as any;
      await modmail.save();
      return true;
    } catch (error) {
      this.logger.error(`Failed to DM user for modmail ${modmailId}:`, error);
      await message.react("❌").catch(() => {});
      await message.reply({ content: "❌ Failed to send message. User may have DMs disabled or blocked the bot." }).catch(() => {});
      return false;
    }
  }

  /**
   * Handle a message edit in a modmail conversation
   * @param modmailId - The modmail ID
   * @param message - The edited message
   * @param isThread - Whether the message is from the thread (vs DM)
   */
  async handleMessageEdit(modmailId: string, message: Message, isThread: boolean): Promise<boolean> {
    const modmail = await Modmail.findOne({ modmailId });
    if (!modmail) {
      this.logger.warn(`Cannot handle edit: modmail ${modmailId} not found`);
      return false;
    }

    // Find the message in history
    const fieldName = isThread ? "discordMessageId" : "discordDmMessageId";
    const messageIndex = modmail.messages.findIndex((m) => m[fieldName] === message.id);

    if (messageIndex === -1) {
      this.logger.debug(`Message ${message.id} not found in modmail ${modmailId} history`);
      return false;
    }

    // Get the message entry safely
    const messageEntry = modmail.messages[messageIndex];
    if (!messageEntry) {
      this.logger.debug(`Message entry at index ${messageIndex} is undefined`);
      return false;
    }

    // Update the message
    const originalContent = messageEntry.content;
    messageEntry.originalContent = originalContent;
    messageEntry.content = message.content;
    messageEntry.isEdited = true;
    messageEntry.editedAt = new Date();

    await (modmail as IModmail & Document).save();

    this.logger.debug(`Recorded edit for message ${message.id} in modmail ${modmailId}`);
    return true;
  }

  /**
   * Handle a message deletion in a modmail conversation
   * @param modmailId - The modmail ID
   * @param messageId - The deleted message ID
   * @param isThread - Whether the message is from the thread (vs DM)
   * @param deletedBy - Who deleted the message (if known)
   */
  async handleMessageDelete(modmailId: string, messageId: string, isThread: boolean, deletedBy?: string): Promise<boolean> {
    const modmail = await Modmail.findOne({ modmailId });
    if (!modmail) {
      this.logger.warn(`Cannot handle delete: modmail ${modmailId} not found`);
      return false;
    }

    // Find the message in history
    const fieldName = isThread ? "discordMessageId" : "discordDmMessageId";
    const messageIndex = modmail.messages.findIndex((m) => m[fieldName] === messageId);

    if (messageIndex === -1) {
      this.logger.debug(`Message ${messageId} not found in modmail ${modmailId} history`);
      return false;
    }

    // Get the message entry safely
    const messageEntry = modmail.messages[messageIndex];
    if (!messageEntry) {
      this.logger.debug(`Message entry at index ${messageIndex} is undefined`);
      return false;
    }

    // Mark the message as deleted
    messageEntry.isDeleted = true;
    messageEntry.deletedAt = new Date();
    if (deletedBy) {
      messageEntry.deletedBy = deletedBy;
    }

    await (modmail as IModmail & Document).save();

    this.logger.debug(`Recorded deletion for message ${messageId} in modmail ${modmailId}`);
    return true;
  }

  /**
   * Check if a message is staff-only (starts with `.`)
   * Staff-only messages are not relayed to the user
   */
  isStaffOnlyMessage(content: string): boolean {
    return content.trimStart().startsWith(".");
  }

  /**
   * Format a staff reply for the user's DM
   */
  formatStaffReply(content: string, staffName: string, guildName: string): string {
    return `**${staffName}:**\n${content}\n\n-# This message was sent by the staff of ${guildName} in response to your modmail.\n-# To reply, simply send a message in this DM.\n-# If you want to close this thread, just click the close button above.`;
  }

  /**
   * Add a message to the modmail history
   */
  async addMessageToModmail(modmail: IModmail, data: AddMessageData): Promise<void> {
    const message: Partial<ModmailMessage> = {
      messageId: nanoid(14),
      authorId: data.authorId,
      authorType: data.authorType,
      context: data.context,
      content: data.content,
      discordMessageId: data.discordMessageId,
      discordDmMessageId: data.discordDmMessageId,
      isStaffOnly: data.isStaffOnly || false,
      attachments: data.attachments || [],
      timestamp: new Date(),
      isEdited: false,
      isDeleted: false,
      deliveredToDm: data.context === MessageContext.DM || data.context === MessageContext.BOTH,
      deliveredToThread: data.context === MessageContext.THREAD || data.context === MessageContext.BOTH,
    };

    // Cast to Document for save() access and push message to array
    const modmailDoc = modmail as IModmail & Document;
    modmailDoc.messages.push(message as any);

    // Update metrics manually since we can't access instance methods reliably
    if (!modmailDoc.metrics) {
      modmailDoc.metrics = {
        totalMessages: 0,
        userMessages: 0,
        staffMessages: 0,
        systemMessages: 0,
        staffOnlyMessages: 0,
        totalAttachments: 0,
        totalResponseTime: 0,
        responseCount: 0,
      };
    }

    modmailDoc.metrics.totalMessages = (modmailDoc.metrics.totalMessages || 0) + 1;

    switch (data.authorType) {
      case MessageType.USER:
        modmailDoc.metrics.userMessages = (modmailDoc.metrics.userMessages || 0) + 1;
        modmailDoc.lastUserActivityAt = new Date();
        modmailDoc.autoCloseWarningAt = null as any;
        break;
      case MessageType.STAFF:
        modmailDoc.metrics.staffMessages = (modmailDoc.metrics.staffMessages || 0) + 1;
        modmailDoc.lastStaffActivityAt = new Date();
        modmailDoc.autoCloseWarningAt = null as any;
        if (data.isStaffOnly) {
          modmailDoc.metrics.staffOnlyMessages = (modmailDoc.metrics.staffOnlyMessages || 0) + 1;
        }
        break;
      case MessageType.SYSTEM:
        modmailDoc.metrics.systemMessages = (modmailDoc.metrics.systemMessages || 0) + 1;
        break;
    }

    if (data.attachments && data.attachments.length > 0) {
      modmailDoc.metrics.totalAttachments = (modmailDoc.metrics.totalAttachments || 0) + data.attachments.length;
    }

    await modmailDoc.save();
  }

  /**
   * Process Discord attachments into storage format
   */
  private processAttachments(attachments: IterableIterator<Attachment>): MessageAttachment[] {
    return [...attachments].map((a) => ({
      discordId: a.id,
      filename: a.name,
      url: a.url,
      proxyUrl: a.proxyURL,
      size: a.size,
      contentType: a.contentType || undefined,
      spoiler: a.spoiler,
    }));
  }
}
