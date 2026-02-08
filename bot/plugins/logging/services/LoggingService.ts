/**
 * LoggingService — Config CRUD, category management, subcategory toggling
 */

import { ChannelType, PermissionFlagsBits, type TextChannel } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import LoggingConfig, { LoggingCategory, MessageSubcategory, UserSubcategory, ModerationSubcategory, AuditSubcategory, type ILoggingConfig } from "../models/LoggingConfig.js";

const log = createLogger("logging:service");

type ConfigDoc = ILoggingConfig & { _id: any; createdAt: Date; updatedAt: Date };

export class LoggingService {
  private client: HeimdallClient;
  private lib: LibAPI;

  constructor(client: HeimdallClient, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
  }

  // ── Config CRUD ────────────────────────────────────────

  /** Get full logging config for a guild */
  async getConfig(guildId: string): Promise<ConfigDoc | null> {
    return LoggingConfig.findOne({ guildId }).lean() as Promise<ConfigDoc | null>;
  }

  /** Delete all logging config for a guild */
  async deleteConfig(guildId: string): Promise<boolean> {
    const result = await LoggingConfig.deleteOne({ guildId });
    return result.deletedCount > 0;
  }

  // ── Category Setup ─────────────────────────────────────

  /** Set up logging for a category, assigning it a channel and enabling default subcategories */
  async setupCategory(guildId: string, category: LoggingCategory, channelId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate channel
      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return { success: false, error: "Guild not found" };

      const channel = await this.lib.thingGetter.getChannel(channelId);
      if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
        return { success: false, error: "Channel must be a text channel" };
      }

      const botMember = guild.members.me;
      if (botMember) {
        const perms = (channel as TextChannel).permissionsFor(botMember);
        if (!perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
          return { success: false, error: "Bot lacks Send Messages or Embed Links permission in that channel" };
        }
      }

      // Default subcategories per category
      const subcategories = new Map<string, boolean>();
      if (category === LoggingCategory.MESSAGES) {
        subcategories.set(MessageSubcategory.EDITS, true);
        subcategories.set(MessageSubcategory.DELETES, true);
        subcategories.set(MessageSubcategory.BULK_DELETES, true);
      } else if (category === LoggingCategory.USERS) {
        subcategories.set(UserSubcategory.PROFILE_UPDATES, true);
        subcategories.set(UserSubcategory.MEMBER_UPDATES, true);
      } else if (category === LoggingCategory.MODERATION) {
        subcategories.set(ModerationSubcategory.BANS, true);
        subcategories.set(ModerationSubcategory.UNBANS, true);
        subcategories.set(ModerationSubcategory.TIMEOUTS, true);
        subcategories.set(ModerationSubcategory.AUTOMOD, true);
        subcategories.set(ModerationSubcategory.MOD_ACTIONS, true);
      } else if (category === LoggingCategory.AUDIT) {
        subcategories.set(AuditSubcategory.DASHBOARD_PERMISSIONS, true);
        subcategories.set(AuditSubcategory.DASHBOARD_SETTINGS, true);
      }

      let config = await LoggingConfig.findOne({ guildId });
      if (!config) {
        config = await LoggingConfig.create({ guildId, globalEnabled: true, categories: [] });
      }

      const existingIdx = config.categories.findIndex((c: any) => c.category === category);
      const entry = { category, channelId, enabled: true, subcategories } as any;

      if (existingIdx >= 0) {
        config.categories[existingIdx] = entry;
      } else {
        config.categories.push(entry);
      }

      await config.save();
      log.debug(`Setup ${category} logging in guild ${guildId} → #${channelId}`);
      return { success: true };
    } catch (error) {
      log.error("Error setting up category logging:", error);
      return { success: false, error: "Database error" };
    }
  }

  // ── Disable / Toggle ───────────────────────────────────

  /** Disable a specific category */
  async disableCategory(guildId: string, category: LoggingCategory): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await LoggingConfig.findOne({ guildId });
      if (!config) return { success: false, error: "Logging not configured" };

      const idx = config.categories.findIndex((c: any) => c.category === category);
      if (idx < 0 || !config.categories[idx]?.enabled) {
        return { success: false, error: "Category not currently enabled" };
      }

      config.categories[idx]!.enabled = false;
      await config.save();
      return { success: true };
    } catch (error) {
      log.error("Error disabling category:", error);
      return { success: false, error: "Database error" };
    }
  }

  /** Toggle global logging on/off for a guild */
  async toggleGlobal(guildId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await LoggingConfig.findOne({ guildId });
      if (!config) return { success: false, error: "Logging not configured" };

      config.globalEnabled = enabled;
      await config.save();
      return { success: true };
    } catch (error) {
      log.error("Error toggling global logging:", error);
      return { success: false, error: "Database error" };
    }
  }

  /** Toggle a specific subcategory within a category */
  async toggleSubcategory(guildId: string, category: LoggingCategory, subcategory: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await LoggingConfig.findOne({ guildId });
      if (!config) return { success: false, error: "Logging not configured" };

      const idx = config.categories.findIndex((c: any) => c.category === category);
      if (idx < 0) return { success: false, error: "Category not configured" };

      config.categories[idx]!.subcategories.set(subcategory, enabled);
      await config.save();
      return { success: true };
    } catch (error) {
      log.error("Error toggling subcategory:", error);
      return { success: false, error: "Database error" };
    }
  }

  // ── Query Helpers ──────────────────────────────────────

  /** Get the channel ID and subcategory map for a category (only if globally + category enabled) */
  async getCategoryChannel(guildId: string, category: LoggingCategory): Promise<{ channelId: string; subcategories: Map<string, boolean> } | null> {
    try {
      const config = await LoggingConfig.findOne({ guildId, globalEnabled: true });
      if (!config) return null;

      const cat = config.categories.find((c: any) => c.category === category && c.enabled);
      if (!cat) return null;

      return { channelId: cat.channelId, subcategories: cat.subcategories };
    } catch (error) {
      log.error("Error getting category channel:", error);
      return null;
    }
  }

  /** Check if a subcategory is enabled (defaults to true if not explicitly set) */
  isSubcategoryEnabled(subcategories: Map<string, boolean>, subcategory: string): boolean {
    return subcategories.get(subcategory) !== false;
  }
}
