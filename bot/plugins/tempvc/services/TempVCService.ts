/**
 * TempVCService - Business logic for temporary voice channels
 *
 * Handles:
 * - Configuration management (CRUD for creator channels)
 * - Channel operations (create, delete, rename, lock, limit, invite, ban)
 * - Redis-based sequential channel numbering
 * - Control panel generation (delegates to TempVCInteractionHandler)
 */

import { ChannelType, PermissionsBitField, type GuildMember, type VoiceChannel, type MessageCreateOptions } from "discord.js";
import type { RedisClientType } from "redis";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import TempVC, { type ITempVC } from "../models/TempVC.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("tempvc:service");

/** Configuration for a single creator channel */
export interface ChannelConfig {
  channelId: string;
  categoryId: string;
  useSequentialNames?: boolean;
  channelName?: string;
}

export class TempVCService {
  private client: HeimdallClient;
  private redis: RedisClientType;
  private lib: LibAPI;
  private interactionHandler?: { buildControlPanel(channelId: string, ownerId: string): Promise<MessageCreateOptions> };

  constructor(client: HeimdallClient, redis: RedisClientType, lib: LibAPI) {
    this.client = client;
    this.redis = redis;
    this.lib = lib;
    log.info("TempVCService initialized");
  }

  /**
   * Set the interaction handler (breaks circular dependency)
   */
  setInteractionHandler(handler: { buildControlPanel(channelId: string, ownerId: string): Promise<MessageCreateOptions> }): void {
    this.interactionHandler = handler;
  }

  // ==================== Configuration Management ====================

  /**
   * Get guild's temp VC configuration
   */
  async getGuildConfig(guildId: string): Promise<ITempVC | null> {
    try {
      return await TempVC.findOne({ guildId });
    } catch (error) {
      log.error(`Failed to get config for guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Add a new temp VC creator channel
   * @throws If channel is already configured
   */
  async addChannel(guildId: string, config: ChannelConfig): Promise<void> {
    let guildConfig = await TempVC.findOne({ guildId });

    if (!guildConfig) {
      guildConfig = new TempVC({ guildId, channels: [config] });
    } else {
      const exists = guildConfig.channels.some((ch) => ch.channelId === config.channelId);
      if (exists) {
        throw new Error("Channel is already configured as a temp VC creator");
      }
      guildConfig.channels.push(config);
    }

    await guildConfig.save();
    log.info(`Added creator channel ${config.channelId} for guild ${guildId}`);
  }

  /**
   * Remove a temp VC creator channel
   * @throws If config or channel not found
   */
  async removeChannel(guildId: string, channelId: string): Promise<void> {
    const guildConfig = await TempVC.findOne({ guildId });
    if (!guildConfig) throw new Error("No temp VC configuration found for this guild");

    const idx = guildConfig.channels.findIndex((ch) => ch.channelId === channelId);
    if (idx === -1) throw new Error("Channel not found in configuration");

    guildConfig.channels.splice(idx, 1);
    await guildConfig.save();
    log.info(`Removed creator channel ${channelId} for guild ${guildId}`);
  }

  /**
   * Remove all temp VC creator channels for a guild
   */
  async removeAllChannels(guildId: string): Promise<void> {
    await TempVC.deleteOne({ guildId });
    log.info(`Removed all creator channels for guild ${guildId}`);
  }

  // ==================== Channel Operations ====================

  /**
   * Create a new temporary voice channel for a member who joined a creator channel
   */
  async createTempChannel(member: GuildMember, config: ChannelConfig, sourceChannel: VoiceChannel): Promise<VoiceChannel> {
    const guild = member.guild;
    const category = guild.channels.cache.get(config.categoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error("Category not found or invalid");
    }

    // Determine channel name
    let channelName: string;
    if (config.useSequentialNames) {
      const number = await this.getNextChannelNumber(guild.id, config.categoryId);
      channelName = `${config.channelName || "Temp VC"} #${number}`;
    } else {
      channelName = `${member.displayName}'s VC`;
    }

    // Create the channel
    const newChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.categoryId,
      permissionOverwrites: [
        {
          id: member.id,
          allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles],
        },
      ],
      userLimit: sourceChannel.userLimit,
      bitrate: sourceChannel.bitrate,
    });

    // Move user to new channel
    try {
      await member.voice.setChannel(newChannel);
    } catch {
      log.warn(`Failed to move user to channel, cleaning up…`);
      await newChannel.delete().catch(() => {});
      throw new Error("Failed to move user to new channel. They may have left too quickly.");
    }

    // Track the channel number for sequential naming
    if (config.useSequentialNames) {
      await this.markNumberUsed(guild.id, config.categoryId, await this.getCurrentNumber(guild.id, config.categoryId));
    }

    // Add to active channels (with opener mapping)
    await this.addToActiveChannels(guild.id, newChannel.id, config.channelId);

    // Send control panel inside the channel
    await this.sendControlPanel(newChannel, member.id);

    log.info(`Created temp channel ${newChannel.id} for user ${member.id} in guild ${guild.id} (opener: ${config.channelId})`);
    return newChannel;
  }

  /**
   * Delete a temporary voice channel and clean up tracking
   */
  async deleteTempChannel(channelId: string, guildId: string): Promise<void> {
    const guild = await this.lib.thingGetter.getGuild(guildId);
    if (!guild) throw new Error("Guild not found");

    const channel = guild.channels.cache.get(channelId) as VoiceChannel | undefined;
    if (channel) {
      await channel.delete();
    }

    await this.removeFromActiveChannels(guildId, channelId);
    log.info(`Deleted temp channel ${channelId} in guild ${guildId}`);
  }

  /**
   * Rename a temporary voice channel
   */
  async renameTempChannel(channel: VoiceChannel, newName: string): Promise<void> {
    await channel.setName(newName);
    log.info(`Renamed channel ${channel.id} to "${newName}"`);
  }

  /**
   * Lock or unlock a temporary voice channel
   */
  async lockTempChannel(channel: VoiceChannel, lock: boolean): Promise<void> {
    const everyoneRole = channel.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyoneRole, {
      Connect: lock ? false : null,
    });
    log.info(`${lock ? "Locked" : "Unlocked"} channel ${channel.id}`);
  }

  /**
   * Set user limit for a temporary voice channel
   */
  async setUserLimit(channel: VoiceChannel, limit: number): Promise<void> {
    await channel.setUserLimit(limit);
    log.info(`Set user limit to ${limit} for channel ${channel.id}`);
  }

  /**
   * Create an invite for a temporary voice channel
   */
  async createInvite(channel: VoiceChannel): Promise<string> {
    const invite = await channel.createInvite({
      maxAge: 600, // 10 minutes
      maxUses: 10,
      unique: true,
    });
    log.info(`Created invite ${invite.code} for channel ${channel.id}`);
    return invite.url;
  }

  /**
   * Ban a user from a temporary voice channel
   */
  async banUserFromChannel(channel: VoiceChannel, userId: string): Promise<void> {
    await channel.permissionOverwrites.edit(userId, { Connect: false });

    // Disconnect if present
    const member = channel.members.get(userId);
    if (member) {
      await member.voice.disconnect().catch(() => {});
    }

    log.info(`Banned user ${userId} from channel ${channel.id}`);
  }

  // ==================== Active Channel Tracking ====================

  /**
   * Check if a channel is an active temp channel
   */
  async isActiveChannel(channelId: string, guildId: string): Promise<boolean> {
    const active = await ActiveTempChannels.findOne({ guildId, channelIds: channelId });
    return active !== null;
  }

  /**
   * Add channel to active tracking with opener mapping
   */
  async addToActiveChannels(guildId: string, channelId: string, openerChannelId?: string): Promise<void> {
    const update: Record<string, unknown> = {
      $addToSet: { channelIds: channelId },
      $set: { updatedAt: new Date() } as Record<string, unknown>,
    };
    if (openerChannelId) {
      (update.$set as Record<string, unknown>)[`openerMap.${channelId}`] = openerChannelId;
    }
    await ActiveTempChannels.findOneAndUpdate({ guildId }, update, { upsert: true });
  }

  /**
   * Remove channel from active tracking and clean up opener mapping
   */
  async removeFromActiveChannels(guildId: string, channelId: string): Promise<void> {
    await ActiveTempChannels.findOneAndUpdate(
      { guildId },
      {
        $pull: { channelIds: channelId },
        $unset: { [`openerMap.${channelId}`]: "" },
        $set: { updatedAt: new Date() },
      },
    );
  }

  /**
   * Look up which opener spawned a given temp channel.
   * Returns the opener channelId or null if not found.
   * Falls back to category-based lookup for temp VCs created before openerMap was added.
   */
  async getOpenerForChannel(guildId: string, channelId: string): Promise<string | null> {
    const doc = await ActiveTempChannels.findOne({ guildId, channelIds: channelId }).lean();
    if (!doc) return null;

    // Try openerMap first (direct mapping)
    const map = doc.openerMap as Map<string, string> | Record<string, string> | undefined;
    if (map) {
      // .lean() returns a POJO so openerMap is a plain object, not a Map
      const openerId = map instanceof Map ? map.get(channelId) : (map as Record<string, string>)[channelId];
      if (openerId) return openerId;
    }

    // Fallback: infer opener from the channel's parent category
    // This handles temp VCs created before openerMap tracking was added
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return null;

      const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
      if (!channel || !("parentId" in channel) || !channel.parentId) return null;

      const config = await TempVC.findOne({ guildId }).lean();
      if (!config?.channels) return null;

      // Find which opener creates channels in this category
      const match = config.channels.find((c) => c.categoryId === channel.parentId);
      if (match) {
        // Backfill the openerMap so future lookups are fast
        await ActiveTempChannels.updateOne({ guildId }, { $set: { [`openerMap.${channelId}`]: match.channelId } });
        log.debug(`Backfilled openerMap for channel ${channelId} → opener ${match.channelId}`);
        return match.channelId;
      }
    } catch (error) {
      log.debug("Category-based opener fallback failed:", error);
    }

    return null;
  }

  // ==================== Redis Channel Numbering ====================

  /**
   * Get the next available sequential channel number.
   * Finds the lowest unused number by checking the "used" set.
   */
  async getNextChannelNumber(guildId: string, categoryId: string): Promise<number> {
    const usedKey = `tempvc:${guildId}:${categoryId}:used_numbers`;

    try {
      const usedNumbers = await this.redis.sMembers(usedKey);
      const usedSet = new Set(usedNumbers.map(Number));

      // Find the lowest available number starting from 1
      let next = 1;
      while (usedSet.has(next)) {
        next++;
      }
      return next;
    } catch (error) {
      log.error("Failed to get next channel number from Redis:", error);
      return 1;
    }
  }

  /**
   * Mark a channel number as used
   */
  async markNumberUsed(guildId: string, categoryId: string, number: number): Promise<void> {
    const usedKey = `tempvc:${guildId}:${categoryId}:used_numbers`;
    try {
      await this.redis.sAdd(usedKey, number.toString());
    } catch (error) {
      log.error("Failed to mark number as used:", error);
    }
  }

  /**
   * Release a channel number so it can be reused
   */
  async releaseChannelNumber(guildId: string, categoryId: string, number: number): Promise<void> {
    const usedKey = `tempvc:${guildId}:${categoryId}:used_numbers`;
    try {
      await this.redis.sRem(usedKey, number.toString());
    } catch (error) {
      log.error("Failed to release channel number:", error);
    }
  }

  /**
   * Get the current next number (without incrementing)
   */
  private async getCurrentNumber(guildId: string, categoryId: string): Promise<number> {
    return this.getNextChannelNumber(guildId, categoryId);
  }

  // ==================== Control Panel ====================

  /**
   * Send the control panel message into a temp channel
   */
  async sendControlPanel(channel: VoiceChannel, ownerId: string): Promise<void> {
    if (!this.interactionHandler) {
      log.error("No interaction handler set — cannot send control panel");
      return;
    }

    try {
      const panel = await this.interactionHandler.buildControlPanel(channel.id, ownerId);
      await channel.send(panel);
    } catch (error) {
      log.error("Failed to send control panel:", error);
    }
  }
}
