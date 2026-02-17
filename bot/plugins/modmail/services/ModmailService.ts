/**
 * ModmailService - Core business logic for the modmail system
 *
 * Handles configuration management, modmail lifecycle, message handling,
 * and integration with the support ban system.
 */

import type { Client, Guild, ForumChannel, Webhook, ThreadChannel } from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "discord.js";
import Modmail, { type IModmail, ModmailStatus, MessageType, MessageContext, type FormResponse } from "../models/Modmail.js";
import ModmailConfig, { type IModmailConfig, type ModmailCategory } from "../models/ModmailConfig.js";
import { SupportBanSystem } from "../../support-core/index.js";
import type { SupportCoreAPI } from "../../support-core/index.js";
import { nanoid } from "nanoid";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import { ModmailWebSocketService } from "../websocket/ModmailWebSocketService.js";
import { broadcast } from "../../../src/core/broadcast.js";

// Re-export enums for consumers
export { ModmailStatus, MessageType, MessageContext };

/**
 * Data required to create a new modmail conversation
 */
export interface CreateModmailData {
  guildId: string;
  userId: string;
  userDisplayName: string;
  initialMessage: string;
  /** Original DM message reference for re-fetching (preserves attachments) */
  initialMessageRef?: { channelId: string; messageId: string };
  /** Message refs queued while the user was answering form questions */
  queuedMessageRefs?: Array<{ channelId: string; messageId: string }>;
  categoryId?: string;
  formResponses?: FormResponse[];
  createdVia?: "dm" | "command" | "button" | "api";
}

/**
 * Data required to close a modmail conversation
 */
export interface CloseModmailData {
  modmailId: string;
  closedBy: string;
  reason?: string;
  isStaff: boolean;
}

/**
 * Options for creating/updating modmail configuration
 */
export interface ModmailConfigOptions {
  guildId: string;
  globalStaffRoleIds?: string[];
  threadNamingPattern?: string;
  minimumMessageLength?: number;
  autoCloseHours?: number;
  autoCloseWarningHours?: number;
  categories?: ModmailCategoryInput[];
  defaultCategoryId?: string;
}

/**
 * Category input for config creation/update
 */
export interface ModmailCategoryInput {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  forumChannelId: string;
  webhookId: string;
  webhookToken?: string; // Plain token (will be encrypted)
  encryptedWebhookToken?: string; // Already encrypted
  staffRoleIds: string[];
  priority: 1 | 2 | 3 | 4;
  formFields?: Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
  }>;
  autoCloseHours?: number;
  resolveAutoCloseHours?: number;
  enabled?: boolean;
}

/**
 * ModmailService - Core business logic for modmail system
 */
export class ModmailService {
  // Expose client for category service
  public readonly client: Client;
  private websocketService: ModmailWebSocketService | null = null;

  constructor(
    client: Client,
    private encryptionKey: string,
    private logger: PluginLogger,
    private supportCoreApi?: SupportCoreAPI,
  ) {
    this.client = client;

    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY is required for ModmailService");
    }
  }

  setWebSocketService(service: ModmailWebSocketService | null): void {
    this.websocketService = service;
  }

  // ========================================
  // CONFIGURATION MANAGEMENT
  // ========================================

  /**
   * Get modmail configuration for a guild.
   * Always fetches directly from MongoDB — no caching.
   */
  async getConfig(guildId: string): Promise<IModmailConfig | null> {
    try {
      return await ModmailConfig.findOne({ guildId });
    } catch (error) {
      this.logger.error(`Failed to get modmail config for guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Create or update modmail configuration for a guild
   */
  async createOrUpdateConfig(options: ModmailConfigOptions): Promise<IModmailConfig | null> {
    try {
      let config = await ModmailConfig.findOne({ guildId: options.guildId });

      // Process categories to encrypt webhook tokens
      const processedCategories: ModmailCategory[] = (options.categories || []).map((cat) => {
        // Validate required fields
        if (!cat.forumChannelId) {
          throw new Error(`Category ${cat.id} is missing required field: forumChannelId`);
        }
        if (!cat.webhookId) {
          throw new Error(`Category ${cat.id} is missing required field: webhookId`);
        }
        if (!cat.webhookToken && !cat.encryptedWebhookToken) {
          throw new Error(`Category ${cat.id} is missing required field: webhookToken or encryptedWebhookToken`);
        }

        // Determine encrypted token
        let encryptedToken: string;
        if (cat.webhookToken) {
          encryptedToken = this.encryptWebhookToken(cat.webhookToken);
        } else if (cat.encryptedWebhookToken) {
          encryptedToken = cat.encryptedWebhookToken;
        } else {
          throw new Error(`Category ${cat.id} has no webhook token`);
        }

        return {
          id: cat.id,
          name: cat.name,
          description: cat.description,
          emoji: cat.emoji,
          forumChannelId: cat.forumChannelId,
          webhookId: cat.webhookId,
          encryptedWebhookToken: encryptedToken,
          staffRoleIds: cat.staffRoleIds || [],
          priority: cat.priority || 2,
          formFields: (cat.formFields || []) as ModmailCategory["formFields"],
          autoCloseHours: cat.autoCloseHours,
          resolveAutoCloseHours: cat.resolveAutoCloseHours || 24,
          enabled: cat.enabled !== false,
        };
      });

      const configData: Partial<IModmailConfig> = {
        guildId: options.guildId,
        globalStaffRoleIds: options.globalStaffRoleIds || [],
        threadNamingPattern: options.threadNamingPattern || "#{number} | {username} | {claimer}",
        minimumMessageLength: options.minimumMessageLength || 50,
        autoCloseHours: options.autoCloseHours || 72,
        autoCloseWarningHours: options.autoCloseWarningHours || 12,
        categories: processedCategories as any,
        defaultCategoryId: options.defaultCategoryId,
      };

      this.logger.debug(`Creating/updating config with ${processedCategories.length} categories`);

      let isCreating = false;
      if (!config) {
        isCreating = true;
        (configData as any).nextTicketNumber = 1;
        config = await ModmailConfig.create(configData);
      } else {
        Object.assign(config, configData);
        await config.save();
      }

      this.logger.info(`Modmail configuration ${isCreating ? "created" : "updated"} for guild ${options.guildId}`);

      // Invalidate cache after update
      await this.invalidateConfigCache(options.guildId);

      if (config) {
        this.websocketService?.configurationUpdated(options.guildId, config, "system");
        broadcast(options.guildId, "dashboard:data_changed", { plugin: "modmail", type: "config_updated" });
      }

      return config;
    } catch (error) {
      this.logger.error("Failed to create/update modmail config:", error);
      return null;
    }
  }

  /**
   * Delete modmail configuration for a guild
   */
  async deleteConfig(guildId: string): Promise<boolean> {
    try {
      const result = await ModmailConfig.deleteOne({ guildId });

      if (result.deletedCount > 0) {
        await this.invalidateConfigCache(guildId);
        this.logger.info(`Deleted modmail config for guild ${guildId}`);
        this.websocketService?.configurationRemoved(guildId, "system");
        broadcast(guildId, "dashboard:data_changed", { plugin: "modmail", type: "config_removed" });
      }

      return result.deletedCount > 0;
    } catch (error) {
      this.logger.error(`Failed to delete modmail config for guild ${guildId}:`, error);
      return false;
    }
  }

  /**
   * No-op — config caching has been removed. Kept for API compatibility.
   */
  async invalidateConfigCache(_guildId: string): Promise<void> {
    // No-op: config is always fetched fresh from MongoDB
  }

  // ========================================
  // MODMAIL LIFECYCLE
  // ========================================

  /**
   * Create a new modmail conversation
   */
  async createModmail(data: CreateModmailData): Promise<IModmail | null> {
    try {
      const config = await this.getConfig(data.guildId);
      if (!config) {
        this.logger.error("Modmail not configured for this guild");
        return null;
      }

      // Note: Ban and duplicate checks are handled by creationService.validateCreation()
      // which is called before this method. No need to duplicate them here.

      // Get next ticket number
      const ticketNumber = await this.getNextTicketNumber(config);

      // Use default category if none specified
      const categoryId = data.categoryId || config.defaultCategoryId;

      // Find the category
      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        throw new Error(`Category ${categoryId} not found`);
      }

      // Create modmail record
      const modmail = await Modmail.create({
        guildId: data.guildId,
        forumChannelId: category.forumChannelId,
        forumThreadId: "pending", // Will be updated after thread creation
        modmailId: nanoid(16),
        ticketNumber,
        userId: data.userId,
        userDisplayName: data.userDisplayName,
        categoryId,
        categoryName: category.name,
        priority: category.priority || 2,
        status: ModmailStatus.OPEN,
        messages: [
          {
            messageId: nanoid(14),
            authorId: data.userId,
            authorType: MessageType.USER,
            context: MessageContext.BOTH,
            content: data.initialMessage,
            attachments: [],
            isStaffOnly: false,
            timestamp: new Date(),
          },
        ],
        formResponses: data.formResponses || [],
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUserActivityAt: new Date(),
        createdVia: data.createdVia || "dm",
      });

      this.logger.info(`Created modmail ${modmail.modmailId} for user ${data.userId} in guild ${data.guildId}`);

      this.websocketService?.conversationCreated(data.guildId, modmail);
      broadcast(data.guildId, "dashboard:data_changed", { plugin: "modmail", type: "conversation_created", modmailId: modmail.modmailId });

      return modmail;
    } catch (error) {
      this.logger.error("Failed to create modmail:", error);
      return null;
    }
  }

  /**
   * Get modmail by ID
   */
  async getModmail(modmailId: string): Promise<IModmail | null> {
    try {
      return await Modmail.findOne({ modmailId });
    } catch (error) {
      this.logger.error(`Failed to get modmail ${modmailId}:`, error);
      return null;
    }
  }

  /**
   * Get modmail by forum thread ID
   */
  async getModmailByThreadId(threadId: string): Promise<IModmail | null> {
    try {
      return await Modmail.findOne({ forumThreadId: threadId });
    } catch (error) {
      this.logger.error(`Failed to get modmail by thread ${threadId}:`, error);
      return null;
    }
  }

  /**
   * Get open modmail for a user (any guild)
   * Used for DM routing (only matches OPEN status)
   */
  async getOpenModmailForUser(userId: string): Promise<IModmail | null> {
    try {
      return await Modmail.findOne({
        userId,
        status: ModmailStatus.OPEN,
      });
    } catch (error) {
      this.logger.error(`Failed to get open modmail for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get active (open or resolved) modmail for a user (any guild)
   * Used for user-facing close button (should work on both open and resolved tickets)
   */
  async getActiveModmailForUser(userId: string): Promise<IModmail | null> {
    try {
      return await Modmail.findOne({
        userId,
        status: { $in: [ModmailStatus.OPEN, ModmailStatus.RESOLVED] },
      });
    } catch (error) {
      this.logger.error(`Failed to get active modmail for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Close a modmail conversation
   */
  async closeModmail(data: CloseModmailData): Promise<boolean> {
    try {
      const modmail = await Modmail.findOne({ modmailId: data.modmailId });
      if (!modmail) {
        this.logger.error(`Modmail ${data.modmailId} not found`);
        return false;
      }

      modmail.status = ModmailStatus.CLOSED;
      modmail.closedBy = data.closedBy;
      modmail.closedAt = new Date();
      if (data.reason) {
        modmail.closeReason = data.reason;
      }

      await modmail.save();

      // Update forum tags to Closed
      await this.updateThreadForumTags(modmail, "closed");

      this.websocketService?.conversationClosed(modmail.guildId as string, modmail, data.closedBy, data.reason);
      broadcast(modmail.guildId as string, "dashboard:data_changed", { plugin: "modmail", type: "conversation_closed", modmailId: modmail.modmailId });

      this.logger.info(`Modmail ${data.modmailId} closed by ${data.closedBy}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to close modmail ${data.modmailId}:`, error);
      return false;
    }
  }

  /**
   * Update forum thread tags based on modmail status
   * @param modmail The modmail document
   * @param status The status to set: "open" or "closed"
   */
  async updateThreadForumTags(modmail: IModmail, status: "open" | "closed"): Promise<void> {
    try {
      // Get the thread
      if (!modmail.forumThreadId || modmail.forumThreadId === "pending") {
        return;
      }

      const thread = await this.client.channels.fetch(modmail.forumThreadId as string);
      if (!thread || !thread.isThread()) {
        return;
      }

      // Get config and category for forum tag IDs
      // Prefer category-level tags, fallback to global config for backwards compatibility
      const config = await this.getConfig(modmail.guildId as string);
      if (!config) {
        return;
      }

      const category = (config.categories as any[])?.find((c: any) => c.id === modmail.categoryId);
      const openTagId = category?.openTagId || (config as any).forumTags?.openTagId;
      const closedTagId = category?.closedTagId || (config as any).forumTags?.closedTagId;

      if (!openTagId || !closedTagId) {
        this.logger.debug(`No forum tags configured for guild ${modmail.guildId}`);
        return;
      }

      // Get current tags and filter out Open/Closed
      const currentTags = ((thread as any).appliedTags as string[]) || [];
      const filteredTags = currentTags.filter((t: string) => t !== openTagId && t !== closedTagId);

      // Add the appropriate tag
      const newTags = status === "open" ? [...filteredTags, openTagId] : [...filteredTags, closedTagId];

      // Update thread tags
      await (thread as any).setAppliedTags(newTags, `Modmail status changed to ${status}`);

      this.logger.debug(`Updated forum tags for modmail ${modmail.modmailId} to ${status}`);
    } catch (error) {
      this.logger.warn(`Failed to update forum tags for modmail ${modmail.modmailId}:`, error);
      // Don't throw - this is a non-critical operation
    }
  }

  // =========================================================================
  // Starter Message Status Manager
  // =========================================================================

  /** Status labels displayed in the starter message embed */
  private static readonly STATUS_LABELS: Record<string, string> = {
    open: "🟠 Unclaimed",
    resolved: "🟢 Resolved",
    closed: "🔴 Closed",
  };

  /**
   * Build the status string for the starter message embed.
   * Handles special sub-states like "Claimed" and "Banned".
   */
  private buildStatusLabel(status: ModmailStatus, extra?: { claimedBy?: string; banned?: boolean }): string {
    if (status === ModmailStatus.CLOSED && extra?.banned) return "🔴 Closed (Banned)";
    if (status === ModmailStatus.OPEN && extra?.claimedBy) return `🟡 Claimed (${extra.claimedBy})`;
    return ModmailService.STATUS_LABELS[status] ?? "🟠 Unclaimed";
  }

  /**
   * Update the Status field in the thread's starter message embed.
   *
   * For terminal states (CLOSED) this also disables all action buttons in a
   * single edit call to avoid double-fetching the starter message.
   *
   * @param forumThreadId - The forum thread to update
   * @param status        - The new ModmailStatus
   * @param extra         - Optional context: claimedBy display name, banned flag
   */
  async updateStarterMessageStatus(forumThreadId: string, status: ModmailStatus, extra?: { claimedBy?: string; banned?: boolean }): Promise<void> {
    try {
      const thread = await this.client.channels.fetch(forumThreadId);
      if (!thread?.isThread()) return;

      const starterMessage = await thread.fetchStarterMessage();
      if (!starterMessage) return;

      // --- Update the embed Status field ---
      const updatedEmbeds = starterMessage.embeds.map((embed) => {
        const data = embed.toJSON();
        if (data.fields) {
          const statusField = data.fields.find((f) => f.name === "Status");
          if (statusField) {
            statusField.value = this.buildStatusLabel(status, extra);
          }
        }
        return data;
      });

      // --- Optionally disable buttons on terminal status ---
      const isTerminal = status === ModmailStatus.CLOSED;
      let components: ActionRowBuilder<ButtonBuilder>[] | undefined;

      if (isTerminal && starterMessage.components.length > 0) {
        components = starterMessage.components.map((row) => {
          const newRow = ActionRowBuilder.from(row as any);
          for (const component of newRow.components) {
            if ("setDisabled" in component && typeof component.setDisabled === "function") {
              component.setDisabled(true);
            }
          }
          return newRow;
        }) as ActionRowBuilder<ButtonBuilder>[];
      }

      await starterMessage.edit({
        embeds: updatedEmbeds,
        ...(components ? { components } : {}),
      });
    } catch (error) {
      this.logger.debug(`Failed to update starter message status for thread ${forumThreadId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve a human-readable claimer label from user ID.
   * Prefers guild display name, then global display name/username, then mention fallback.
   */
  private async resolveClaimerLabel(guildId: string, userId: string): Promise<string> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      if (member?.displayName) return member.displayName;
    } catch {
      // Fall through to user/global fallback
    }

    try {
      const user = await this.client.users.fetch(userId);
      return user.displayName || user.username;
    } catch {
      return `<@${userId}>`;
    }
  }

  /**
   * High-level starter panel status sync for a modmail.
   * Derives status context (like claimer label) from modmail state so callers
   * don't need to pass presentation extras manually.
   */
  async syncStarterMessageStatus(modmailOrId: IModmail | string, statusOverride?: ModmailStatus, extra?: { banned?: boolean }): Promise<void> {
    try {
      const modmail = typeof modmailOrId === "string" ? await Modmail.findOne({ modmailId: modmailOrId }) : modmailOrId;

      if (!modmail?.forumThreadId) return;

      const status = statusOverride ?? modmail.status;
      let claimedBy: string | undefined;

      if (status === ModmailStatus.OPEN && modmail.claimedBy) {
        claimedBy = await this.resolveClaimerLabel(modmail.guildId as string, modmail.claimedBy as string);
      }

      await this.updateStarterMessageStatus(modmail.forumThreadId as string, status, {
        ...(claimedBy ? { claimedBy } : {}),
        ...(extra?.banned ? { banned: true } : {}),
      });
    } catch (error) {
      this.logger.debug(`Failed to sync starter message status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Lock and archive a modmail thread
   * Used after close, ban, or other terminal actions
   * Locks first (prevents further messages), then archives
   */
  async archiveThread(forumThreadId: string): Promise<void> {
    try {
      const thread = await this.client.channels.fetch(forumThreadId);
      if (thread?.isThread()) {
        await thread.setLocked(true).catch(() => {});
        await thread.setArchived(true);
      }
    } catch (error) {
      this.logger.debug(`Failed to lock/archive thread ${forumThreadId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Finalize a modmail thread after a terminal action (close, ban, etc.)
   * Updates the starter message status to Closed (disabling buttons in the same edit),
   * then locks and archives the thread.
   *
   * @param forumThreadId - The forum thread to finalize
   * @param extra         - Optional context: banned flag for "Closed (Banned)" label
   */
  async finalizeThread(forumThreadId: string, extra?: { banned?: boolean }): Promise<void> {
    await this.updateStarterMessageStatus(forumThreadId, ModmailStatus.CLOSED, extra);
    await this.archiveThread(forumThreadId);
  }

  /**
   * Cancel the resolve auto-close timer and set ticket back to OPEN.
   * Called when a user clicks "I Need More Help" on a RESOLVED ticket.
   * Does NOT unlock/unarchive threads or clear closed fields — this is not a full reopen.
   */
  async cancelResolveTimer(modmailId: string): Promise<boolean> {
    try {
      const modmail = await Modmail.findOne({ modmailId });
      if (!modmail) {
        this.logger.error(`Modmail ${modmailId} not found`);
        return false;
      }

      if (modmail.status !== ModmailStatus.RESOLVED) {
        this.logger.warn(`Modmail ${modmailId} is not resolved (status: ${modmail.status}), cannot cancel resolve timer`);
        return false;
      }

      // Clear resolved fields and reset to OPEN
      modmail.status = ModmailStatus.OPEN;
      modmail.markedResolvedBy = undefined;
      modmail.markedResolvedAt = undefined;
      modmail.resolveAutoCloseAt = undefined;
      modmail.lastUserActivityAt = new Date();
      modmail.autoCloseWarningAt = null as any;

      await modmail.save();

      // Update forum tags back to Open
      await this.updateThreadForumTags(modmail, "open");

      this.websocketService?.additionalHelpRequested(modmail.guildId as string, modmail);
      broadcast(modmail.guildId as string, "dashboard:data_changed", { plugin: "modmail", type: "additional_help_requested", modmailId: modmail.modmailId });

      this.logger.info(`Resolve timer cancelled for modmail ${modmailId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel resolve timer for modmail ${modmailId}:`, error);
      return false;
    }
  }

  /**
   * Mark modmail as resolved
   */
  async markResolved(modmailId: string, staffId: string): Promise<boolean> {
    try {
      const modmail = await Modmail.findOne({ modmailId });
      if (!modmail) {
        this.logger.error(`Modmail ${modmailId} not found`);
        return false;
      }

      if (modmail.status === ModmailStatus.CLOSED) {
        this.logger.warn(`Cannot mark closed modmail ${modmailId} as resolved`);
        return false;
      }

      modmail.status = ModmailStatus.RESOLVED;
      modmail.markedResolvedBy = staffId;
      modmail.markedResolvedAt = new Date();

      // Get config for auto-close timing
      const config = await this.getConfig(modmail.guildId as string);
      const category = ((config?.categories as ModmailCategory[]) || []).find((c) => c.id === modmail.categoryId);
      const resolveAutoCloseHours = category?.resolveAutoCloseHours || 24;

      // Set auto-close schedule
      modmail.resolveAutoCloseAt = new Date(Date.now() + resolveAutoCloseHours * 60 * 60 * 1000);

      await modmail.save();

      this.websocketService?.conversationResolved(modmail.guildId as string, modmail.modmailId, modmail.ticketNumber, staffId);
      broadcast(modmail.guildId as string, "dashboard:data_changed", { plugin: "modmail", type: "conversation_resolved", modmailId: modmail.modmailId });

      this.logger.info(`Modmail ${modmailId} marked resolved by ${staffId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to mark modmail ${modmailId} as resolved:`, error);
      return false;
    }
  }

  /**
   * Claim a modmail conversation (atomic operation to prevent race conditions)
   * Uses findOneAndUpdate to atomically check and set claimedBy
   * @returns Object with success status and previous claimer if already claimed
   */
  async claimModmail(modmailId: string, staffId: string): Promise<{ success: boolean; alreadyClaimedBy?: string }> {
    try {
      // Use findOneAndUpdate with condition claimedBy: null for atomic claiming
      // This prevents race conditions where two staff try to claim simultaneously
      const result = await Modmail.findOneAndUpdate(
        {
          modmailId,
          claimedBy: null, // Only update if not already claimed
        },
        {
          claimedBy: staffId,
          claimedAt: new Date(),
        },
        {
          new: false, // Return the document BEFORE update (to check if it was claimed)
        },
      );

      if (!result) {
        // Either modmail doesn't exist, or it's already claimed
        const existing = await Modmail.findOne({ modmailId });
        if (!existing) {
          this.logger.error(`Modmail ${modmailId} not found`);
          return { success: false };
        }

        // Already claimed by someone
        if (existing.claimedBy) {
          this.logger.warn(`Modmail ${modmailId} already claimed by ${existing.claimedBy}`);
          return { success: false, alreadyClaimedBy: existing.claimedBy };
        }

        return { success: false };
      }

      this.logger.info(`Modmail ${modmailId} claimed by ${staffId}`);
      this.websocketService?.conversationClaimed(result.guildId as string, result.modmailId as string, result.ticketNumber as number, staffId);
      broadcast(result.guildId as string, "dashboard:data_changed", { plugin: "modmail", type: "conversation_claimed", modmailId: result.modmailId });
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to claim modmail ${modmailId}:`, error);
      return { success: false };
    }
  }

  /**
   * Unclaim a modmail conversation
   */
  async unclaimModmail(modmailId: string, staffId: string): Promise<boolean> {
    try {
      const modmail = await Modmail.findOne({ modmailId });
      if (!modmail) {
        this.logger.error(`Modmail ${modmailId} not found`);
        return false;
      }

      if (!modmail.claimedBy) {
        this.logger.warn(`Modmail ${modmailId} is not claimed`);
        return false;
      }

      // Only allow the claimer or staff to unclaim
      // For now, we allow anyone to unclaim - permission check should be done upstream
      const previousClaimer = modmail.claimedBy;
      modmail.claimedBy = undefined;
      modmail.claimedAt = undefined;

      await modmail.save();

      this.websocketService?.conversationUnclaimed(modmail.guildId as string, modmail.modmailId as string, modmail.ticketNumber as number, staffId);
      broadcast(modmail.guildId as string, "dashboard:data_changed", { plugin: "modmail", type: "conversation_unclaimed", modmailId: modmail.modmailId });

      this.logger.info(`Modmail ${modmailId} unclaimed (was claimed by ${previousClaimer})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to unclaim modmail ${modmailId}:`, error);
      return false;
    }
  }

  /**
   * Update thread name after claiming
   */
  async updateThreadNameOnClaim(modmailId: string, staffId: string): Promise<boolean> {
    try {
      const modmail = await Modmail.findOne({ modmailId });
      if (!modmail || !modmail.forumThreadId || modmail.forumThreadId === "pending") {
        this.logger.error(`Modmail ${modmailId} or thread not found for name update`);
        return false;
      }

      // Get claimer display name
      let claimerName = staffId;
      try {
        const user = await this.client.users.fetch(staffId);
        if (user) {
          claimerName = user.displayName || user.username;
        }
      } catch {
        // Use ID if user fetch fails
      }

      // Get the thread
      const channel = await this.client.channels.fetch(modmail.forumThreadId as string);
      if (!channel || !channel.isThread()) {
        this.logger.error(`Thread ${modmail.forumThreadId} not found or not a thread`);
        return false;
      }

      // Get config for naming pattern
      const config = await this.getConfig(modmail.guildId as string);
      if (!config) {
        this.logger.error(`Config not found for guild ${modmail.guildId}`);
        return false;
      }

      // Generate new name
      const pattern = config.threadNamingPattern || "#{number} | {username} | {claimer}";
      const newName = pattern
        .replace("{number}", modmail.ticketNumber.toString())
        .replace("{username}", modmail.userDisplayName as string)
        .replace("{claimer}", claimerName)
        .replace("{category}", (modmail.categoryName as string) || "general");

      // Truncate if needed (Discord limit is 100 chars) — use Array.from for Unicode safety
      const nameChars = Array.from(newName);
      const truncatedName = nameChars.length > 100 ? nameChars.slice(0, 99).join("") + "…" : newName;

      await (channel as ThreadChannel).setName(truncatedName);

      this.logger.info(`Updated thread name for modmail ${modmailId} with claimer ${claimerName}`);
      return true;
    } catch (error) {
      this.logger.error("Failed to update thread name on claim:", error);
      return false;
    }
  }

  // ========================================
  // USER CHECKS
  // ========================================

  /**
   * Check if user has an open modmail conversation in a guild
   */
  async userHasOpenModmail(guildId: string, userId: string): Promise<boolean> {
    try {
      return await Modmail.userHasOpenModmail(guildId, userId);
    } catch (error) {
      this.logger.error(`Failed to check open modmail for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Check if user is banned from modmail (via SupportBanService)
   */
  async isUserBanned(guildId: string, userId: string): Promise<boolean> {
    if (!this.supportCoreApi) {
      return false;
    }

    try {
      return await this.supportCoreApi.SupportBan.isBanned(guildId, userId, SupportBanSystem.MODMAIL);
    } catch (error) {
      this.logger.error(`Failed to check ban status for user ${userId}:`, error);
      return false;
    }
  }

  // ========================================
  // TICKET NUMBER
  // ========================================

  /**
   * Get the next ticket number (atomic increment)
   */
  private async getNextTicketNumber(config: IModmailConfig): Promise<number> {
    try {
      // Use atomic increment to avoid race conditions
      const updated = await ModmailConfig.findOneAndUpdate(
        { guildId: config.guildId },
        { $inc: { nextTicketNumber: 1 } },
        { new: false }, // Return the document BEFORE increment
      );

      if (!updated) {
        this.logger.error(`Failed to increment ticket number for guild ${config.guildId}`);
        return config.nextTicketNumber || 1;
      }

      // Invalidate cache since we updated the config
      await this.invalidateConfigCache(config.guildId as string);

      return updated.nextTicketNumber;
    } catch (error) {
      this.logger.error("Failed to get next ticket number:", error);
      return config.nextTicketNumber || 1;
    }
  }

  // ========================================
  // WEBHOOK MANAGEMENT
  // ========================================

  /**
   * Create a webhook for a modmail category
   */
  async createWebhook(guild: Guild, forumChannel: ForumChannel): Promise<{ webhookId: string; webhookToken: string } | null> {
    try {
      const webhookName = `Heimdall Modmail - ${guild.name}`;

      // Check for existing webhooks first
      const existingWebhooks = await forumChannel.fetchWebhooks();
      const existingWebhook = existingWebhooks.find((wh) => wh.name === webhookName);

      if (existingWebhook && existingWebhook.token) {
        this.logger.debug(`Reusing existing modmail webhook: ${existingWebhook.id}`);
        return {
          webhookId: existingWebhook.id,
          webhookToken: existingWebhook.token,
        };
      }

      // Create new webhook
      const webhook = await forumChannel.createWebhook({
        name: webhookName,
        reason: "Modmail system webhook for message relay",
      });

      if (!webhook.token) {
        this.logger.error("Created webhook has no token");
        return null;
      }

      this.logger.debug(`Created new modmail webhook: ${webhook.id}`);
      return {
        webhookId: webhook.id,
        webhookToken: webhook.token,
      };
    } catch (error) {
      this.logger.error("Failed to create modmail webhook:", error);
      return null;
    }
  }

  /**
   * Get webhook for sending messages
   */
  async getWebhook(config: IModmailConfig, categoryId: string): Promise<Webhook | null> {
    try {
      const category = (config.categories as ModmailCategory[]).find((c) => c.id === categoryId);
      if (!category) {
        this.logger.error(`Category ${categoryId} not found in config for guild ${config.guildId}`);
        return null;
      }

      if (!category.webhookId || !category.encryptedWebhookToken) {
        this.logger.error(`Category ${categoryId} missing webhook configuration`);
        return null;
      }

      const webhookToken = this.decryptWebhookToken(category.encryptedWebhookToken);
      return await this.client.fetchWebhook(category.webhookId, webhookToken);
    } catch (error) {
      this.logger.error(`Failed to get modmail webhook for category ${categoryId}:`, error);
      return null;
    }
  }

  // ========================================
  // ENCRYPTION
  // ========================================

  /**
   * Encrypt a webhook token
   */
  private encryptWebhookToken(token: string): string {
    return ModmailConfig.encryptWebhookToken(token, this.encryptionKey);
  }

  /**
   * Decrypt a webhook token
   */
  private decryptWebhookToken(encrypted: string): string {
    return ModmailConfig.decryptWebhookToken(encrypted, this.encryptionKey);
  }
}
