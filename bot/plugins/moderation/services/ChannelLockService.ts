/**
 * ChannelLockService — Manages channel locking, permission snapshots,
 * sticky messages, and automatic expiry.
 *
 * Locking a channel:
 * 1. Snapshots all permission overwrites
 * 2. Checks if channel syncs permissions with parent category
 * 3. Denies SendMessages / SendMessagesInThreads / CreatePublicThreads /
 *    CreatePrivateThreads / AddReactions for @everyone and all roles
 * 4. Allows those permissions for configured bypass roles
 * 5. Sends a sticky embed explaining the lock
 *
 * Unlocking a channel:
 * 1. Restores saved permission overwrites (or re-syncs with parent)
 * 2. Deletes the sticky message
 * 3. Removes the lock record
 */

import {
  type Guild,
  type GuildTextBasedChannel,
  type TextChannel,
  type NewsChannel,
  PermissionsBitField,
  OverwriteType,
  ChannelType,
} from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import type { LoggingPluginAPI } from "../../logging/index.js";
import type { ModerationService } from "./ModerationService.js";
import ChannelLock, { type IChannelLock } from "../models/ChannelLock.js";
import { ACTION_COLORS, LOCK_CACHE_TTL, CACHE_KEYS } from "../utils/constants.js";
import type { RedisClientType } from "redis";

const log = createLogger("moderation:channel-lock");

type ChannelLockDoc = IChannelLock & { _id: any; createdAt: Date; updatedAt: Date };

/** Permissions denied during a channel lock */
const LOCK_DENY_PERMISSIONS = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.AddReactions,
] as const;

function lockDenyBitfield(): bigint {
  return LOCK_DENY_PERMISSIONS.reduce((acc, flag) => acc | flag, 0n);
}

export class ChannelLockService {
  private client: HeimdallClient;
  private redis: RedisClientType;
  private lib: LibAPI;
  private logging: LoggingPluginAPI | null;
  private moderationService: ModerationService;
  private expiryInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    client: HeimdallClient,
    redis: RedisClientType,
    lib: LibAPI,
    logging: LoggingPluginAPI | null,
    moderationService: ModerationService,
  ) {
    this.client = client;
    this.redis = redis;
    this.lib = lib;
    this.logging = logging;
    this.moderationService = moderationService;

    // Check for expired locks every 30 seconds
    this.expiryInterval = setInterval(() => this.processExpiredLocks(), 30_000);
  }

  dispose(): void {
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
  }

  // ── Lock a Channel ─────────────────────────────────────

  async lockChannel(
    channel: TextChannel | NewsChannel,
    moderatorId: string,
    reason: string,
    duration?: number | null,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const guild = channel.guild;

      // Check if already locked
      const existing = await ChannelLock.findOne({ channelId: channel.id });
      if (existing) {
        return { success: false, error: "This channel is already locked." };
      }

      // Snapshot current permission overwrites
      const previousOverwrites = channel.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type === OverwriteType.Role ? 0 : 1,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      }));

      // Check if the channel syncs permissions with its parent category
      const wasSyncedWithParent = channel.parent ? channel.permissionsLocked === true : false;

      // Get bypass roles from config
      const config = await this.moderationService.getConfig(guild.id);
      const bypassRoles: string[] = (config as any)?.lockBypassRoles ?? [];

      // Deny write permissions for @everyone
      const denyBits = lockDenyBitfield();
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        AddReactions: false,
      }, { reason: `Channel locked by <@${moderatorId}>: ${reason}` });

      // Deny write permissions for all roles that have overwrites
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.type === OverwriteType.Role && overwrite.id !== guild.roles.everyone.id) {
          // Skip bypass roles
          if (bypassRoles.includes(overwrite.id)) continue;

          await channel.permissionOverwrites.edit(overwrite.id, {
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            AddReactions: false,
          }, { reason: `Channel locked by <@${moderatorId}>: ${reason}` });
        }
      }

      // Allow bypass roles to write
      for (const roleId of bypassRoles) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await channel.permissionOverwrites.edit(role, {
            SendMessages: true,
            SendMessagesInThreads: true,
            CreatePublicThreads: true,
            CreatePrivateThreads: true,
            AddReactions: true,
          }, { reason: `Lock bypass role` });
        }
      }

      // Send sticky lock message
      const expiresAt = duration ? new Date(Date.now() + duration) : null;
      const stickyEmbed = this.buildLockEmbed(reason, moderatorId, expiresAt);
      const stickyMessage = await channel.send({ embeds: [stickyEmbed] });

      // Save lock record
      await ChannelLock.create({
        guildId: guild.id,
        channelId: channel.id,
        moderatorId,
        reason,
        previousOverwrites: previousOverwrites as any,
        wasSyncedWithParent,
        stickyMessageId: stickyMessage.id,
        expiresAt,
      });

      await this.invalidateLockCache(guild.id);

      log.info(`Channel ${channel.name} (${channel.id}) locked in ${guild.name} by ${moderatorId}`);
      return { success: true };
    } catch (error) {
      log.error("Failed to lock channel:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Unlock a Channel ───────────────────────────────────

  async unlockChannel(
    channel: TextChannel | NewsChannel,
    moderatorId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const guild = channel.guild;

      const lockRecord = await ChannelLock.findOne({ channelId: channel.id });
      if (!lockRecord) {
        return { success: false, error: "This channel is not locked." };
      }

      // Delete sticky message
      if (lockRecord.stickyMessageId) {
        try {
          const stickyMsg = await channel.messages.fetch(lockRecord.stickyMessageId);
          await stickyMsg.delete();
        } catch {
          // Message may already be deleted
        }
      }

      // Restore permissions
      if (lockRecord.wasSyncedWithParent && channel.parent) {
        // Re-sync with parent category
        await channel.lockPermissions();
      } else {
        // First, remove all current overwrites
        for (const [id] of channel.permissionOverwrites.cache) {
          try {
            await channel.permissionOverwrites.delete(id, "Restoring pre-lock permissions");
          } catch {
            // May fail if the role/user no longer exists
          }
        }

        // Then restore saved overwrites
        for (const saved of lockRecord.previousOverwrites) {
          try {
            await channel.permissionOverwrites.create(
              saved.id,
              {
                ...Object.fromEntries(
                  new PermissionsBitField(BigInt(saved.allow)).toArray().map((p) => [p, true]),
                ),
                ...Object.fromEntries(
                  new PermissionsBitField(BigInt(saved.deny)).toArray().map((p) => [p, false]),
                ),
              },
              {
                type: saved.type === 0 ? OverwriteType.Role : OverwriteType.Member,
                reason: moderatorId ? `Channel unlocked by <@${moderatorId}>` : "Channel lock expired",
              },
            );
          } catch (err) {
            log.warn(`Failed to restore overwrite for ${saved.id}:`, err);
          }
        }
      }

      // Remove lock record
      await ChannelLock.deleteOne({ channelId: channel.id });
      await this.invalidateLockCache(guild.id);

      log.info(`Channel ${channel.name} (${channel.id}) unlocked in ${guild.name}`);
      return { success: true };
    } catch (error) {
      log.error("Failed to unlock channel:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Sticky Message Management ──────────────────────────

  /**
   * Re-send the sticky message to keep it at the bottom of the channel.
   * Called from the messageCreate event handler.
   */
  async refreshStickyMessage(channel: TextChannel | NewsChannel): Promise<void> {
    try {
      const lockRecord = await ChannelLock.findOne({ channelId: channel.id });
      if (!lockRecord) return;

      // Delete old sticky
      if (lockRecord.stickyMessageId) {
        try {
          const oldMsg = await channel.messages.fetch(lockRecord.stickyMessageId);
          await oldMsg.delete();
        } catch {
          // Already deleted
        }
      }

      // Send new sticky
      const stickyEmbed = this.buildLockEmbed(
        lockRecord.reason,
        lockRecord.moderatorId,
        lockRecord.expiresAt ?? null,
      );
      const newMsg = await channel.send({ embeds: [stickyEmbed] });

      // Update record with new message ID
      await ChannelLock.updateOne(
        { channelId: channel.id },
        { $set: { stickyMessageId: newMsg.id } },
      );
    } catch (error) {
      log.error("Failed to refresh sticky lock message:", error);
    }
  }

  // ── Query Methods ──────────────────────────────────────

  /**
   * Check if a channel is currently locked.
   */
  async isLocked(channelId: string): Promise<boolean> {
    const count = await ChannelLock.countDocuments({ channelId });
    return count > 0;
  }

  /**
   * Get lock record for a channel.
   */
  async getLock(channelId: string): Promise<ChannelLockDoc | null> {
    return (await ChannelLock.findOne({ channelId }).lean()) as ChannelLockDoc | null;
  }

  /**
   * Get all locked channels for a guild.
   */
  async getGuildLocks(guildId: string): Promise<ChannelLockDoc[]> {
    try {
      const cached = await this.redis.get(`${CACHE_KEYS.LOCKS}:${guildId}`);
      if (cached) return JSON.parse(cached) as ChannelLockDoc[];

      const locks = (await ChannelLock.find({ guildId }).sort({ createdAt: -1 }).lean()) as ChannelLockDoc[];
      await this.redis.setEx(`${CACHE_KEYS.LOCKS}:${guildId}`, LOCK_CACHE_TTL, JSON.stringify(locks));
      return locks;
    } catch (error) {
      log.error("Error getting guild locks:", error);
      return [];
    }
  }

  // ── Expiry Processing ──────────────────────────────────

  private async processExpiredLocks(): Promise<void> {
    try {
      const expired = await ChannelLock.find({
        expiresAt: { $ne: null, $lte: new Date() },
      });

      for (const lock of expired) {
        try {
          const guild = this.client.guilds.cache.get(lock.guildId);
          if (!guild) {
            // Guild not available, just remove the record
            await ChannelLock.deleteOne({ _id: lock._id });
            continue;
          }

          const channel = guild.channels.cache.get(lock.channelId);
          if (!channel || !channel.isTextBased()) {
            await ChannelLock.deleteOne({ _id: lock._id });
            continue;
          }

          await this.unlockChannel(channel as TextChannel | NewsChannel);

          // Send unlock notification
          try {
            const embed = this.lib
              .createEmbedBuilder()
              .setColor(0x22c55e)
              .setTitle("🔓 Channel Unlocked")
              .setDescription("This channel's lock has expired and permissions have been restored.")
              .setTimestamp();
            await (channel as TextChannel).send({ embeds: [embed] });
          } catch {
            // Can't send — channel might have been deleted during unlock
          }

          log.info(`Lock expired for channel ${lock.channelId} in guild ${lock.guildId}`);
        } catch (err) {
          log.error(`Error processing expired lock ${lock.channelId}:`, err);
        }
      }
    } catch (error) {
      log.error("Error processing expired locks:", error);
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private buildLockEmbed(reason: string, moderatorId: string, expiresAt: Date | null) {
    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0xef4444)
      .setTitle("🔒 Channel Locked")
      .setDescription(`This channel has been locked by a moderator.`)
      .addFields(
        { name: "Reason", value: reason || "No reason provided" },
        { name: "Locked by", value: `<@${moderatorId}>`, inline: true },
      );

    if (expiresAt) {
      embed.addFields({
        name: "Expires",
        value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        inline: true,
      });
    }

    embed.setTimestamp();
    return embed;
  }

  private async invalidateLockCache(guildId: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_KEYS.LOCKS}:${guildId}`);
    } catch (error) {
      log.error("Error invalidating lock cache:", error);
    }
  }
}
