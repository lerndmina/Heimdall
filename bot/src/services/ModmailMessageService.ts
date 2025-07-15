import Database from "../utils/data/database";
import Modmail, { ModmailType, ModmailMessageType } from "../models/Modmail";
import log from "../utils/log";
import { Snowflake } from "discord.js";

export interface ModmailMessageData {
  messageId: string;
  type: "user" | "staff";
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;

  // Discord message references
  discordMessageId?: string; // The actual Discord message ID
  discordMessageUrl?: string; // Full URL to the Discord message
  webhookMessageId?: string; // If sent via webhook
  webhookMessageUrl?: string; // Full URL to the webhook message
  dmMessageId?: string; // If sent as DM
  dmMessageUrl?: string; // Full URL to the DM message

  // Message metadata
  attachments?: Array<{
    filename: string;
    url: string;
    size: number;
    contentType?: string;
  }>;

  // Editing tracking
  isEdited: boolean;
  editedContent?: string;
  editedAt?: Date;
  editedBy?: string;

  // Timestamps
  createdAt: Date;

  // Internal flags
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

// Helper function to convert Mongoose document to our interface
function convertToModmailMessageData(doc: any): ModmailMessageData {
  return {
    messageId: doc.messageId,
    type: doc.type,
    content: doc.content,
    authorId: doc.authorId,
    authorName: doc.authorName,
    authorAvatar: doc.authorAvatar,
    discordMessageId: doc.discordMessageId,
    discordMessageUrl: doc.discordMessageUrl,
    webhookMessageId: doc.webhookMessageId,
    webhookMessageUrl: doc.webhookMessageUrl,
    dmMessageId: doc.dmMessageId,
    dmMessageUrl: doc.dmMessageUrl,
    attachments: doc.attachments || [],
    isEdited: doc.isEdited || false,
    editedContent: doc.editedContent,
    editedAt: doc.editedAt,
    editedBy: doc.editedBy,
    createdAt: doc.createdAt,
    isDeleted: doc.isDeleted || false,
    deletedAt: doc.deletedAt,
    deletedBy: doc.deletedBy,
  };
}

/**
 * Shared formatting functions for modmail messages
 */
export class ModmailMessageFormatter {
  // Compiled regex patterns for better performance
  private static readonly STAFF_REPLY_REGEX =
    /^### .+? Responded:\n([\s\S]+?)\n-# This message was sent by/;
  private static readonly STAFF_REPLY_CHECK_REGEX =
    /### .+? Responded:\n.*-# This message was sent by a staff member/;

  /**
   * Format a staff reply message for DM
   */
  static formatStaffReplyForDM(
    content: string,
    staffMemberName: string,
    guildName: string
  ): string {
    return (
      `### ${staffMemberName} Responded:` +
      `\n${content}` +
      `\n-# This message was sent by a staff member of **${guildName}** in reply to your modmail thread.` +
      `\n-# If you want to close this thread, just send \`/modmail close\` here`
    );
  }

  /**
   * Format a user message for webhook (maintains original format)
   */
  static formatUserMessageForWebhook(content: string, isForwarded?: boolean): string {
    if (isForwarded) {
      // If we know it's forwarded, ensure it has the indicator
      if (!content.includes("[Forwarded Message]")) {
        return `📤 **[Forwarded Message]**\n${content}`;
      }
    }
    // User messages in webhooks are sent as-is with user's avatar and name
    return content;
  }

  /**
   * Extract the original content from a formatted staff reply (optimized with compiled regex)
   */
  static extractContentFromStaffReply(formattedMessage: string): string {
    // Match the staff reply format and extract just the content part
    const match = formattedMessage.match(this.STAFF_REPLY_REGEX);
    return match ? match[1] : formattedMessage;
  }

  /**
   * Check if a message is a formatted staff reply (optimized with compiled regex)
   */
  static isFormattedStaffReply(content: string): boolean {
    return this.STAFF_REPLY_CHECK_REGEX.test(content);
  }

  /**
   * Check if a message contains forwarded message indicators
   */
  static isForwardedMessage(content: string): boolean {
    return content.includes("[Forwarded Message]") || content.includes("📤");
  }
}

export class ModmailMessageService {
  private static indexesEnsured = false;
  private static dbInstance: Database | null = null;
  private db: Database;

  // Discord message length limit
  private static readonly MAX_MESSAGE_LENGTH = 2000;

  /**
   * Truncate message content to Discord's character limit with proper handling
   */
  static truncateMessage(content: string): string {
    if (content.length <= this.MAX_MESSAGE_LENGTH) {
      return content;
    }

    // Truncate and add indicator
    const truncated = content.substring(0, this.MAX_MESSAGE_LENGTH - 100);
    return `${truncated}...\n*[Message truncated]*`;
  }

  constructor() {
    // Use singleton pattern for database instance to improve performance
    if (!ModmailMessageService.dbInstance) {
      ModmailMessageService.dbInstance = new Database();
    }
    this.db = ModmailMessageService.dbInstance;
  }

  /**
   * Ensure indexes exist for the modmail collection (called on first use)
   */
  private static async ensureIndexesOnDemand(): Promise<void> {
    if (this.indexesEnsured) return;

    try {
      const { DatabaseIndexService } = await import("./DatabaseIndexService");
      await DatabaseIndexService.ensureModmailIndexes();
      this.indexesEnsured = true;
      log.debug("Modmail indexes ensured on-demand");
    } catch (error) {
      log.warn(`Failed to ensure indexes on-demand: ${error}`);
      // Don't block operations if index creation fails
    }
  }

  /**
   * Add a new message to a modmail thread
   */
  async addMessage(
    userId: string,
    messageData: Omit<ModmailMessageData, "createdAt" | "isEdited">
  ): Promise<ModmailType | null> {
    try {
      await ModmailMessageService.ensureIndexesOnDemand();

      const completeMessageData: ModmailMessageData = {
        ...messageData,
        createdAt: new Date(),
        isEdited: false,
      };

      const result = await this.db.pushToArray(
        Modmail,
        { userId },
        "messages",
        completeMessageData,
        { slice: -1000 } // Keep only last 1000 messages
      );

      if (result) {
        log.debug(`Added message ${messageData.messageId} to modmail for user ${userId}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to add message to modmail: ${error}`);
      return null;
    }
  }

  /**
   * Edit an existing message in a modmail thread
   */
  async editMessage(
    userId: string,
    messageId: string,
    newContent: string,
    editedBy: string
  ): Promise<ModmailType | null> {
    try {
      const result = await this.db.updateArrayElement(
        Modmail,
        { userId },
        "messages",
        { messageId },
        {
          isEdited: true,
          editedContent: newContent,
          editedAt: new Date(),
          editedBy,
          // If message was previously deleted, undelete it when edited
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
        }
      );

      if (result) {
        log.debug(`Edited message ${messageId} in modmail for user ${userId}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to edit message in modmail: ${error}`);
      return null;
    }
  }

  /**
   * Soft delete a message (mark as deleted without removing)
   */
  async deleteMessage(
    userId: string,
    messageId: string,
    deletedBy: string
  ): Promise<ModmailType | null> {
    try {
      const result = await this.db.updateArrayElement(
        Modmail,
        { userId },
        "messages",
        { messageId },
        {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy,
        }
      );

      if (result) {
        log.debug(`Deleted message ${messageId} in modmail for user ${userId}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to delete message in modmail: ${error}`);
      return null;
    }
  }

  /**
   * Get recent messages from a modmail thread (optimized with early returns)
   */
  async getRecentMessages(
    userId: string,
    limit: number = 50
  ): Promise<ModmailMessageData[] | null> {
    try {
      // Early return for invalid limit
      if (limit <= 0) return [];

      // Cap limit to prevent excessive memory usage
      const effectiveLimit = Math.min(limit, 1000);

      const result = await this.db.findLastArrayElements(
        Modmail,
        { userId },
        "messages",
        effectiveLimit
      );

      if (!result?.messages?.length) return null;
      return result.messages.map(convertToModmailMessageData);
    } catch (error) {
      log.error(`Failed to get recent messages: ${error}`);
      return null;
    }
  }

  /**
   * Find a message by its Discord message ID (for editing operations)
   * Optimized with early returns and single query
   */
  async findMessageByDiscordId(
    userId: string,
    discordMessageId: string
  ): Promise<ModmailMessageData | null> {
    try {
      // Fetch the full document since the database utility doesn't support projections
      const modmail = await this.db.findOne(Modmail, { userId });

      if (!modmail?.messages?.length) return null;

      // Use Array.find for efficiency instead of filter + [0]
      const message = modmail.messages.find(
        (msg: any) =>
          msg.discordMessageId === discordMessageId ||
          msg.webhookMessageId === discordMessageId ||
          msg.dmMessageId === discordMessageId
      );

      return message ? convertToModmailMessageData(message) : null;
    } catch (error) {
      log.error(`Failed to find message by Discord ID: ${error}`);
      return null;
    }
  }

  /**
   * Update Discord message references for a message
   */
  async updateMessageReferences(
    userId: string,
    messageId: string,
    references: {
      discordMessageId?: string;
      webhookMessageId?: string;
      dmMessageId?: string;
    }
  ): Promise<ModmailType | null> {
    try {
      const result = await this.db.updateArrayElement(
        Modmail,
        { userId },
        "messages",
        { messageId },
        references
      );

      if (result) {
        log.debug(`Updated message references for ${messageId} in modmail for user ${userId}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to update message references: ${error}`);
      return null;
    }
  }

  /**
   * Get message count for a modmail thread
   */
  async getMessageCount(userId: string): Promise<number> {
    try {
      return await this.db.getArrayElementCount(Modmail, { userId }, "messages");
    } catch (error) {
      log.error(`Failed to get message count: ${error}`);
      return 0;
    }
  }

  /**
   * Get all messages for export (full thread history)
   */
  async getAllMessages(userId: string): Promise<ModmailMessageData[] | null> {
    try {
      const modmail = await this.db.findOne(Modmail, { userId });
      if (!modmail?.messages) return null;
      return modmail.messages.map(convertToModmailMessageData);
    } catch (error) {
      log.error(`Failed to get all messages: ${error}`);
      return null;
    }
  }

  /**
   * Get messages filtered by type (user or staff)
   */
  async getMessagesByType(
    userId: string,
    type: "user" | "staff",
    limit: number = 100
  ): Promise<ModmailMessageData[] | null> {
    try {
      const modmail = await this.db.findOne(Modmail, { userId });
      if (!modmail?.messages) return null;

      const filteredMessages = modmail.messages
        .filter((msg: any) => msg.type === type && !msg.isDeleted)
        .slice(-limit)
        .map(convertToModmailMessageData);

      return filteredMessages;
    } catch (error) {
      log.error(`Failed to get messages by type: ${error}`);
      return null;
    }
  }

  /**
   * Search messages by content (optimized with case-insensitive regex)
   */
  async searchMessages(
    userId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<ModmailMessageData[] | null> {
    try {
      // Early return for empty search term
      if (!searchTerm.trim()) return [];

      const modmail = await this.db.findOne(Modmail, { userId });
      if (!modmail?.messages?.length) return null;

      // Optimize search with early compilation of regex and case-insensitive matching
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const searchResults = modmail.messages
        .filter((msg: any) => {
          if (msg.isDeleted) return false;

          // Test content first (most common case)
          if (searchRegex.test(msg.content)) return true;

          // Test edited content if exists
          return msg.editedContent && searchRegex.test(msg.editedContent);
        })
        .slice(-limit)
        .map(convertToModmailMessageData);

      return searchResults;
    } catch (error) {
      log.error(`Failed to search messages: ${error}`);
      return null;
    }
  }

  /**
   * Generate a unique message ID for tracking
   */
  generateMessageId(): string {
    return `mm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Batch update message statuses with improved error handling
   */
  async batchUpdateMessages(
    userId: string,
    messageUpdates: Array<{
      messageId: string;
      updates: Partial<ModmailMessageData>;
    }>
  ): Promise<ModmailType | null> {
    try {
      // Early return for empty updates
      if (!messageUpdates.length) return null;

      let result: ModmailType | null = null;
      const errors: string[] = [];

      // Process updates but collect errors instead of failing immediately
      for (const { messageId, updates } of messageUpdates) {
        try {
          result = await this.db.updateArrayElement(
            Modmail,
            { userId },
            "messages",
            { messageId },
            updates
          );
        } catch (error) {
          errors.push(`Failed to update message ${messageId}: ${error}`);
        }
      }

      // Log errors but don't fail the entire batch
      if (errors.length > 0) {
        log.warn(`Batch update had ${errors.length} errors: ${errors.join("; ")}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to batch update messages: ${error}`);
      return null;
    }
  }

  /**
   * Format message content for display (handles deleted messages with strikethrough)
   */
  formatMessageContent(message: ModmailMessageData): string {
    let content = message.content;

    // If message is deleted, show strikethrough
    if (message.isDeleted) {
      content = `~~${content}~~`;
      if (message.deletedBy) {
        content += ` *(deleted by ${message.deletedBy})*`;
      }
    }

    // If message is edited, show current content with edit indicator
    if (message.isEdited && message.editedContent) {
      content = message.editedContent;
      if (message.editedBy) {
        content += ` *(edited by ${message.editedBy})*`;
      }
    }

    return content;
  }

  /**
   * Get formatted message for Discord display
   */
  getDisplayMessage(message: ModmailMessageData): {
    content: string;
    isDeleted: boolean;
    isEdited: boolean;
    timestamp: Date;
    author: {
      id: string;
      name: string;
      avatar?: string;
    };
  } {
    return {
      content: this.formatMessageContent(message),
      isDeleted: message.isDeleted || false,
      isEdited: message.isEdited,
      timestamp: message.editedAt || message.createdAt,
      author: {
        id: message.authorId,
        name: message.authorName,
        avatar: message.authorAvatar,
      },
    };
  }

  /**
   * Initialize the message service and ensure database indexes
   */
  static async initialize(): Promise<void> {
    try {
      const { DatabaseIndexService } = await import("./DatabaseIndexService");
      await DatabaseIndexService.initializeDatabase();
      log.info("ModmailMessageService initialized successfully");
    } catch (error) {
      log.error(`Failed to initialize ModmailMessageService: ${error}`);
      // Don't throw - allow the bot to continue and indexes will be created on-demand
      log.warn("ModmailMessageService will create indexes on-demand when needed");
    }
  }

  /**
   * Create a Discord message URL from components
   */
  static createMessageUrl(guildId: string | null, channelId: string, messageId: string): string {
    if (guildId) {
      return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
    } else {
      // DM message
      return `https://discord.com/channels/@me/${channelId}/${messageId}`;
    }
  }

  /**
   * Parse a Discord message URL to extract components (optimized with compiled regex)
   */
  private static readonly MESSAGE_URL_REGEX =
    /https:\/\/discord\.com\/channels\/(@me|\d+)\/(\d+)\/(\d+)/;

  static parseMessageUrl(
    url: string
  ): { guildId: string | null; channelId: string; messageId: string } | null {
    const match = url.match(this.MESSAGE_URL_REGEX);

    if (!match) return null;

    return {
      guildId: match[1] === "@me" ? null : match[1],
      channelId: match[2],
      messageId: match[3],
    };
  }

  /**
   * Safely fetch a Discord message from URL with proper error handling
   */
  static async fetchMessageFromUrl(client: any, url: string): Promise<any | null> {
    try {
      const parsed = this.parseMessageUrl(url);
      if (!parsed) return null;

      const channel = await client.channels.fetch(parsed.channelId);
      if (!channel) return null;

      const message = await channel.messages.fetch(parsed.messageId);
      return message;
    } catch (error) {
      log.error(`Failed to fetch message from URL ${url}: ${error}`);
      return null;
    }
  }

  /**
   * Safely edit a Discord message using URL with proper error handling
   * Uses webhook API for webhook messages, regular API for other messages
   */
  static async editMessageFromUrl(
    client: any,
    url: string,
    content: string,
    webhookId?: string,
    webhookToken?: string
  ): Promise<boolean> {
    try {
      // Truncate content to Discord's character limit
      const truncatedContent = this.truncateMessage(content);

      // Debug logging
      log.debug(
        `editMessageFromUrl called with webhookId: ${
          webhookId ? "present" : "missing"
        }, webhookToken: ${webhookToken ? "present" : "missing"}`
      );

      // If we have webhook credentials, use webhook API
      if (webhookId && webhookToken) {
        log.debug(`Using webhook API for message edit: ${url}`);
        return await this.editWebhookMessage(
          client,
          url,
          truncatedContent,
          webhookId,
          webhookToken
        );
      }

      // Otherwise use regular message API
      log.debug(`Using regular message API for message edit: ${url}`);
      const message = await this.fetchMessageFromUrl(client, url);
      if (!message) return false;

      await message.edit(truncatedContent);
      return true;
    } catch (error) {
      log.error(`Failed to edit message from URL ${url}: ${error}`);
      return false;
    }
  }

  /**
   * Edit a webhook message using the webhook API
   */
  static async editWebhookMessage(
    client: any,
    url: string,
    content: string,
    webhookId: string,
    webhookToken: string
  ): Promise<boolean> {
    try {
      // Truncate content to Discord's character limit
      const truncatedContent = this.truncateMessage(content);

      log.debug(`editWebhookMessage called for URL: ${url}, webhookId: ${webhookId}`);

      const parsed = this.parseMessageUrl(url);
      if (!parsed) {
        log.error(`Failed to parse message URL: ${url}`);
        return false;
      }

      log.debug(
        `Parsed URL - guildId: ${parsed.guildId}, channelId: ${parsed.channelId}, messageId: ${parsed.messageId}`
      );

      log.debug(`Parsed message ID: ${parsed.messageId}, channelId: ${parsed.channelId}`);

      const webhook = await client.fetchWebhook(webhookId, webhookToken);
      if (!webhook) {
        log.error(`Failed to fetch webhook with ID: ${webhookId}`);
        return false;
      }

      log.debug(`Successfully fetched webhook, attempting to edit message ${parsed.messageId}`);

      // For webhook messages in forum threads, we need to provide the threadId
      const editOptions: any = { content: truncatedContent };
      if (parsed.guildId) {
        // If this is a guild message (not a DM), it's likely in a forum thread
        editOptions.threadId = parsed.channelId;
        log.debug(`Adding threadId ${parsed.channelId} for forum thread webhook edit`);
      }

      await webhook.editMessage(parsed.messageId, editOptions);
      log.debug(`Successfully edited webhook message ${parsed.messageId}`);
      return true;
    } catch (error) {
      log.error(`Failed to edit webhook message from URL ${url}: ${error}`);
      return false;
    }
  }

  /**
   * Safely delete a Discord message using URL with proper error handling
   * Uses webhook API for webhook messages, regular API for other messages
   */
  static async deleteMessageFromUrl(
    client: any,
    url: string,
    webhookId?: string,
    webhookToken?: string
  ): Promise<boolean> {
    try {
      // If we have webhook credentials, use webhook API
      if (webhookId && webhookToken) {
        return await this.deleteWebhookMessage(client, url, webhookId, webhookToken);
      }

      // Otherwise use regular message API
      const message = await this.fetchMessageFromUrl(client, url);
      if (!message) return false;

      await message.delete();
      return true;
    } catch (error) {
      log.error(`Failed to delete message from URL ${url}: ${error}`);
      return false;
    }
  }

  /**
   * Delete a webhook message using the webhook API
   */
  static async deleteWebhookMessage(
    client: any,
    url: string,
    webhookId: string,
    webhookToken: string
  ): Promise<boolean> {
    try {
      const parsed = this.parseMessageUrl(url);
      if (!parsed) return false;

      const webhook = await client.fetchWebhook(webhookId, webhookToken);
      if (!webhook) return false;

      // For webhook messages in forum threads, we need to provide the threadId
      const deleteOptions: any = {};
      if (parsed.guildId) {
        // If this is a guild message (not a DM), it's likely in a forum thread
        deleteOptions.threadId = parsed.channelId;
        log.debug(`Adding threadId ${parsed.channelId} for forum thread webhook delete`);
      }

      await webhook.deleteMessage(parsed.messageId, deleteOptions);
      return true;
    } catch (error) {
      log.error(`Failed to delete webhook message from URL ${url}: ${error}`);
      return false;
    }
  }
}

export default ModmailMessageService;
