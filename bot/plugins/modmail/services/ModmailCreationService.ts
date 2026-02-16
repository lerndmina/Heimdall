/**
 * ModmailCreationService - Handles the complete modmail creation flow
 *
 * Manages the full creation flow including:
 * - Validation (config, bans, existing open modmail)
 * - Record creation with placeholder thread ID
 * - Forum thread creation with initial message
 * - Record update with actual thread ID
 * - Cleanup on failure
 */

import type { Client, ForumChannel, ThreadChannel, Message, Attachment } from "discord.js";
import { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { ModmailService, CreateModmailData } from "./ModmailService.js";
import type { ModmailCategoryService } from "./ModmailCategoryService.js";
import Modmail, { type IModmail, ModmailStatus, MessageType, MessageContext, type MessageAttachment } from "../models/Modmail.js";
import type { IModmailConfig, ModmailCategory } from "../models/ModmailConfig.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { LibAPI } from "../../lib/index.js";
import type { Document } from "mongoose";
import type { ModmailFlowService } from "./ModmailFlowService.js";

/** Staff tips shown randomly in the opening embed of new modmail threads */
const STAFF_TIPS: string[] = [
  "Messages starting with `.` are staff-only (not relayed to the user).",
  "**Ban User** bans a user from modmail, not from the server.",
  "If you think you can help, claim a ticket *before* typing your answer so other staff don't get in your way.",
  "Use **Close with Reason** to provide context — the reason is shown to the user.",
  "Resolved tickets auto-close if the user doesn't respond. No need to follow up manually.",
  "You can include a final message to the user when closing — just fill in the optional field in the close modal.",
];

/**
 * Result of a modmail creation attempt
 */
export interface ModmailCreationResult {
  success: boolean;
  modmailId?: string;
  channelId?: string;
  error?: string;
  userMessage?: string;
  metadata?: {
    modmailId: string;
    channelId: string;
    ticketNumber: number;
    welcomeMessageSent: boolean;
  };
}

/** Discord DM file-size limit for bots (8 MB) */
const DM_FILE_SIZE_LIMIT = 8 * 1024 * 1024;

/** Format bytes into a human-readable size string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ModmailCreationService - Full creation flow for modmail conversations
 */
export class ModmailCreationService {
  private flowService: ModmailFlowService | null = null;

  constructor(
    private client: Client,
    private modmailService: ModmailService,
    private categoryService: ModmailCategoryService,
    private lib: LibAPI,
    private logger: PluginLogger,
  ) {}

  /**
   * Set the flow service reference (avoids circular dependency at construction time)
   */
  setFlowService(flowService: ModmailFlowService): void {
    this.flowService = flowService;
  }

  /**
   * Create a new modmail conversation with forum thread
   * Full flow: validate → create record → create thread → update record
   */
  async createModmail(data: CreateModmailData): Promise<ModmailCreationResult> {
    // 1. Get config
    const config = await this.modmailService.getConfig(data.guildId);
    if (!config) {
      return {
        success: false,
        error: "Not configured",
        userMessage: "❌ This server has not configured modmail support.",
      };
    }

    // 2. Validate creation conditions
    const validation = await this.validateCreation(data, config);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || "Validation failed",
        userMessage: validation.userMessage,
      };
    }

    // 3. Determine category
    const category = this.determineCategory(config, data.categoryId);
    if (!category) {
      return {
        success: false,
        error: "No category",
        userMessage: "❌ Could not find a valid modmail category. Please contact server staff.",
      };
    }

    // 4. Create modmail record (with placeholder forumThreadId)
    const modmail = await this.modmailService.createModmail({
      ...data,
      categoryId: category.id,
    });

    if (!modmail) {
      return {
        success: false,
        error: "Failed to create record",
        userMessage: "❌ Failed to create modmail record. Please try again later.",
      };
    }

    // Cast modmail to include Document methods
    const modmailDoc = modmail as IModmail & Document;

    // 5. Create forum thread
    try {
      const thread = await this.createForumThread(modmailDoc, config, category);

      // 6. Update modmail with thread ID
      modmailDoc.forumThreadId = thread.id;
      await modmailDoc.save();

      // 7. Send welcome message in thread (re-fetches original DM to preserve attachments)
      let welcomeMessageSent = false;
      try {
        await this.sendWelcomeMessage(modmailDoc, thread, config, category, data.initialMessageRef);
        welcomeMessageSent = true;
      } catch (welcomeError) {
        this.logger.warn(`Failed to send welcome message for modmail ${modmailDoc.modmailId}:`, welcomeError);
      }

      // 8. Forward any messages the user sent while answering form questions
      if (data.queuedMessageRefs && data.queuedMessageRefs.length > 0 && this.flowService) {
        await this.forwardQueuedMessages(modmailDoc, data.queuedMessageRefs);
      }

      this.logger.info(`Created modmail ${modmailDoc.modmailId} with thread ${thread.id}`);

      return {
        success: true,
        modmailId: modmailDoc.modmailId as string,
        channelId: thread.id,
        metadata: {
          modmailId: modmailDoc.modmailId as string,
          channelId: thread.id,
          ticketNumber: modmailDoc.ticketNumber,
          welcomeMessageSent,
        },
      };
    } catch (error) {
      // Cleanup orphan record if thread creation fails
      this.logger.error(`Failed to create forum thread for modmail ${modmailDoc.modmailId}:`, error);
      await this.cleanupFailedCreation(modmailDoc.modmailId as string);

      return {
        success: false,
        error: "Failed to create thread",
        userMessage: "❌ Failed to create support thread. Please try again later.",
      };
    }
  }

  /**
   * Validate creation conditions
   * Checks: config exists, user not banned, no existing open modmail
   */
  async validateCreation(data: CreateModmailData, config: IModmailConfig): Promise<{ valid: boolean; error?: string; userMessage?: string }> {
    // Check if user is banned
    const isBanned = await this.modmailService.isUserBanned(data.guildId, data.userId);
    if (isBanned) {
      this.logger.warn(`Banned user ${data.userId} attempted to create modmail in guild ${data.guildId}`);
      return {
        valid: false,
        error: "Banned",
        userMessage: "❌ You are banned from using modmail in this server.",
      };
    }

    // Check if user already has open modmail
    const hasOpen = await this.modmailService.userHasOpenModmail(data.guildId, data.userId);
    if (hasOpen) {
      this.logger.warn(`User ${data.userId} attempted to create duplicate modmail in guild ${data.guildId}`);
      return {
        valid: false,
        error: "Already open",
        userMessage: "❌ You already have an open modmail conversation in this server. Please wait for a response or close your existing ticket.",
      };
    }

    // Check if categories are available
    const enabledCategories = (config.categories as ModmailCategory[]).filter((c) => c.enabled);
    if (enabledCategories.length === 0) {
      return {
        valid: false,
        error: "No categories",
        userMessage: "❌ This server has not configured any modmail categories.",
      };
    }

    return { valid: true };
  }

  /**
   * Determine which category to use for the modmail
   * Priority: specified categoryId → default category → first enabled category
   */
  determineCategory(config: IModmailConfig, categoryId?: string): ModmailCategory | null {
    const categories = config.categories as ModmailCategory[];

    // 1. Try specified category
    if (categoryId) {
      const specified = categories.find((c) => c.id === categoryId && c.enabled);
      if (specified) return specified;
    }

    // 2. Try default category
    if (config.defaultCategoryId) {
      const defaultCat = categories.find((c) => c.id === config.defaultCategoryId && c.enabled);
      if (defaultCat) return defaultCat;
    }

    // 3. Fall back to first enabled category
    const firstEnabled = categories.find((c) => c.enabled);
    return firstEnabled || null;
  }

  /**
   * Create the forum thread for the modmail
   * Creates thread with initial message containing user info and initial message
   */
  async createForumThread(modmail: IModmail & Document, config: IModmailConfig, category: ModmailCategory): Promise<ThreadChannel> {
    // Get forum channel
    const channel = await this.lib.thingGetter.getChannel(category.forumChannelId);
    if (!channel || channel.type !== ChannelType.GuildForum) {
      throw new Error(`Forum channel ${category.forumChannelId} not found or not a forum channel`);
    }

    const forumChannel = channel as ForumChannel;

    // Generate thread name
    const pattern = config.threadNamingPattern || "#{number} | {username}";
    const threadName = pattern
      .replace("{number}", modmail.ticketNumber.toString())
      .replace("{username}", modmail.userDisplayName as string)
      .replace("{claimer}", "unclaimed")
      .replace("{category}", category.name);

    // Truncate if needed (Discord limit is 100 chars)
    const truncatedName = threadName.length > 100 ? threadName.substring(0, 99) + "…" : threadName;

    // Get user for avatar
    const user = await this.lib.thingGetter.getUser(modmail.userId as string);

    // Build initial message embed with a random staff tip
    const tip = STAFF_TIPS[Math.floor(Math.random() * STAFF_TIPS.length)];
    const embed = this.lib
      .createEmbedBuilder()
      .setTitle(`📬 Modmail #${modmail.ticketNumber}`)
      .setDescription(`New modmail from **${modmail.userDisplayName}**\n\n💡 **Tip**: ${tip}`)
      .setColor(0x5865f2)
      .addFields({ name: "User", value: `<@${modmail.userId}>`, inline: true }, { name: "Category", value: category.name, inline: true }, { name: "Status", value: "🟠 Unclaimed", inline: true })
      .setThumbnail(user?.displayAvatarURL() || null)
      .setTimestamp();

    // Create staff action buttons on the opening message
    const claimButton = await this.lib.componentCallbackService.createPersistentComponent("modmail.staff.claim", "button", { modmailId: modmail.modmailId });
    const resolveButton = await this.lib.componentCallbackService.createPersistentComponent("modmail.staff.resolve", "button", { modmailId: modmail.modmailId });
    const closeButton = await this.lib.componentCallbackService.createPersistentComponent("modmail.staff.close", "button", { modmailId: modmail.modmailId });
    const banButton = await this.lib.componentCallbackService.createPersistentComponent("modmail.staff.ban", "button", { modmailId: modmail.modmailId });

    // Row 1: Claim + Resolve (matches old system layout)
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(claimButton).setLabel("Claim Ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(resolveButton).setLabel("Mark Resolved").setEmoji("✅").setStyle(ButtonStyle.Success),
    );

    // Row 2: Close + Ban (matches old system layout)
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(closeButton).setLabel("Close with Reason").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(banButton).setLabel("Ban User").setEmoji("🔨").setStyle(ButtonStyle.Danger),
    );

    // Determine applied tags (Open tag if configured)
    // Prefer category-level tags, fallback to global config for backwards compatibility
    const appliedTags: string[] = [];
    const openTagId = category.openTagId || (config as any).forumTags?.openTagId;
    if (openTagId) {
      appliedTags.push(openTagId);
    }

    // Build staff role mentions for the starter message content
    const staffRoles = [...category.staffRoleIds, ...((config.globalStaffRoleIds as string[]) || [])];
    const mentionContent = staffRoles.length > 0 ? staffRoles.map((id) => `<@&${id}>`).join(" ") : undefined;

    // Create the thread with notification embed, staff mentions, and action buttons
    const thread = await forumChannel.threads.create({
      name: truncatedName,
      message: {
        content: mentionContent,
        embeds: [embed],
        components: [row1, row2],
        allowedMentions: staffRoles.length > 0 ? { roles: staffRoles } : undefined,
      },
      appliedTags,
      reason: `Modmail #${modmail.ticketNumber} created by ${modmail.userDisplayName}`,
    });

    this.logger.debug(`Created forum thread ${thread.id} for modmail ${modmail.modmailId}`);

    return thread;
  }

  /**
   * Send welcome message in the thread
   * Re-fetches the original DM to preserve attachments, then posts via webhook.
   * Falls back to stored text if the original message was deleted.
   */
  async sendWelcomeMessage(
    modmail: IModmail & Document,
    thread: ThreadChannel,
    config: IModmailConfig,
    category: ModmailCategory,
    initialMessageRef?: { channelId: string; messageId: string },
  ): Promise<void> {
    // Get webhook for sending user's initial message
    const webhook = await this.modmailService.getWebhook(config, category.id);
    const user = await this.lib.thingGetter.getUser(modmail.userId as string);

    const storedMessage = modmail.messages[0];
    if (!webhook) return;

    // Try to re-fetch the original DM so we get attachments
    let originalDm: Message | null = null;
    if (initialMessageRef) {
      try {
        const dmChannel = await this.client.channels.fetch(initialMessageRef.channelId);
        if (dmChannel?.isTextBased()) {
          originalDm = await dmChannel.messages.fetch(initialMessageRef.messageId);
        }
      } catch {
        this.logger.debug(`Could not re-fetch original DM ${initialMessageRef.messageId} – it may have been deleted`);
      }
    }

    // Build content & file list from the fetched message (or fall back to stored text)
    const content = originalDm?.content ?? storedMessage?.content ?? "*No message content*";
    const attachmentUrls: string[] = [];
    const attachmentData: MessageAttachment[] = [];
    const oversizedWarnings: string[] = [];

    if (originalDm && originalDm.attachments.size > 0) {
      const maxSizeBytes = ((config as any).maxAttachmentSizeMB ?? 25) * 1024 * 1024;
      const attachmentsAllowed = (config as any).allowAttachments !== false;

      for (const attachment of originalDm.attachments.values()) {
        // Record attachment metadata regardless
        attachmentData.push({
          discordId: attachment.id,
          filename: attachment.name,
          url: attachment.url,
          proxyUrl: attachment.proxyURL,
          size: attachment.size,
          contentType: attachment.contentType || undefined,
          spoiler: attachment.spoiler,
        });

        if (!attachmentsAllowed) {
          oversizedWarnings.push(`• **${attachment.name}** – attachments are disabled for this server`);
          continue;
        }

        if (attachment.size > maxSizeBytes) {
          oversizedWarnings.push(`• **${attachment.name}** (${formatFileSize(attachment.size)}) exceeds the **${(config as any).maxAttachmentSizeMB ?? 25} MB** limit`);
          continue;
        }

        attachmentUrls.push(attachment.url);
      }

      // Update the stored message entry with attachment metadata
      if (storedMessage) {
        storedMessage.attachments = attachmentData;
        await modmail.save();
      }
    }

    const formResponses = modmail.formResponses;
    if (formResponses && formResponses.length > 0) {
      const formResponseMessages = this.buildFormResponseMessages(formResponses as Array<{ value?: string }>);
      for (const formResponseMessage of formResponseMessages) {
        await thread.send({ content: formResponseMessage });
      }
    }

    try {
      await webhook.send({
        content: content || "*No message content*",
        username: modmail.userDisplayName as string,
        avatarURL: user?.displayAvatarURL(),
        files: attachmentUrls.length > 0 ? attachmentUrls : undefined,
        threadId: thread.id,
      });

      // Post a staff-only warning if any attachments were skipped
      if (oversizedWarnings.length > 0) {
        await thread.send({
          content: `⚠️ The following attachment(s) from the user's initial message could not be forwarded:\n${oversizedWarnings.join("\n")}`,
        });
      }
    } catch (webhookError) {
      this.logger.warn(`Failed to send initial message via webhook for modmail ${modmail.modmailId}:`, webhookError);
      // Fallback to regular message
      await thread.send({
        content: `**${modmail.userDisplayName}**: ${content || "*No message content*"}`,
      });
    }

    // Staff role mentions are now included in the thread starter message (createForumThread)
  }

  /**
   * Build one or more bot messages containing form responses in markdown format.
   * Splits into multiple messages when nearing Discord's 2000-char limit.
   */
  private buildFormResponseMessages(formResponses: Array<{ value?: string }>): string[] {
    const title = "# Form Responses:";
    const maxLength = 2000;
    const messages: string[] = [];

    let current = title;

    for (let i = 0; i < formResponses.length; i++) {
      const answer = (formResponses[i]?.value || "(no response)").trim() || "(no response)";

      // Keep each section bounded so we can safely chunk across messages.
      const boundedAnswer = answer.length > 1500 ? `${answer.substring(0, 1497)}...` : answer;
      const section = `\n## Question ${i + 1}\n${boundedAnswer}\n`;

      if ((current + section).length > maxLength) {
        messages.push(current.trimEnd());
        current = `${title}${section}`;
      } else {
        current += section;
      }
    }

    if (current.trim().length > 0) {
      messages.push(current.trimEnd());
    }

    return messages;
  }

  /**
   * Forward messages that were queued while the user was answering form questions.
   * Re-fetches each message from the DM channel and relays via the flow service.
   */
  private async forwardQueuedMessages(modmail: IModmail & Document, queuedRefs: Array<{ channelId: string; messageId: string }>): Promise<void> {
    if (!this.flowService) return;

    const modmailId = modmail.modmailId as string;
    this.logger.debug(`Forwarding ${queuedRefs.length} queued message(s) to modmail ${modmailId}`);

    for (const ref of queuedRefs) {
      try {
        const dmChannel = await this.client.channels.fetch(ref.channelId);
        if (!dmChannel?.isTextBased()) continue;

        const message = await dmChannel.messages.fetch(ref.messageId);
        if (!message) continue;

        const success = await this.flowService.relayUserMessageToThread(modmailId, message);
        if (success) {
          // React to the queued message to indicate it was delivered
          try {
            await message.react("📨");
          } catch {
            // Ignore reaction failures
          }
        }
      } catch (error) {
        this.logger.debug(`Could not forward queued message ${ref.messageId}: may have been deleted`);
      }
    }
  }

  /**
   * Cleanup a failed modmail creation
   * Deletes the orphan modmail record
   */
  async cleanupFailedCreation(modmailId: string): Promise<void> {
    try {
      await Modmail.deleteOne({ modmailId });
      this.logger.info(`Cleaned up failed modmail creation: ${modmailId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup modmail ${modmailId}:`, error);
    }
  }
}
