/**
 * TempVCService - Business logic for temporary voice channels
 *
 * Handles:
 * - Configuration management (CRUD for creator channels)
 * - Channel operations (create, delete, rename, lock, limit, invite, ban)
 * - Redis-based sequential channel numbering
 * - Control panel generation (delegates to TempVCInteractionHandler)
 */

import { ChannelType, PermissionsBitField, PermissionFlagsBits, type GuildMember, type VoiceChannel, type MessageCreateOptions, type OverwriteResolvable } from "discord.js";
import type { RedisClientType } from "redis";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import TempVC, { type ITempVC } from "../models/TempVC.js";
import ActiveTempChannels from "../models/ActiveTempChannels.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

const log = createLogger("tempvc:service");

/** Permission state for a single permission type */
export type PermissionState = "allow" | "deny" | "neutral";

/** A role override entry */
export interface RoleOverride {
  roleId: string;
  view: PermissionState;
  connect: PermissionState;
}

/** Configuration for a single creator channel */
export interface ChannelConfig {
  channelId: string;
  categoryId: string;
  useSequentialNames?: boolean;
  channelName?: string;
  permissionMode?: "none" | "inherit_opener" | "inherit_category" | "custom";
  roleOverrides?: RoleOverride[];
  sendInviteDM?: boolean;
}

export class TempVCService {
  private client: HeimdallClient;
  private redis: RedisClientType;
  private lib: LibAPI;
  private interactionHandler?: { buildControlPanel(channelId: string, ownerId: string): Promise<MessageCreateOptions> };

  private static readonly OWNER_BASELINE_PERMISSIONS = {
    ViewChannel: true,
    Connect: true,
    Speak: true,
    SendMessages: true,
    ReadMessageHistory: true,
    UseApplicationCommands: true,
    ManageChannels: true,
    ManageRoles: true,
  } as const;

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

    // Build permission overwrites
    const permissionOverwrites = await this.buildPermissionOverwrites(member, config, sourceChannel);

    // Create the channel
    const newChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.categoryId,
      permissionOverwrites,
      userLimit: sourceChannel.userLimit,
      bitrate: sourceChannel.bitrate,
    });

    await this.ensureOwnerPermissions(newChannel, member.id);

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

    broadcastDashboardChange(guild.id, "tempvc", "active_updated", {
      requiredAction: "tempvc.view_config",
    });

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
    broadcastDashboardChange(guildId, "tempvc", "active_updated", {
      requiredAction: "tempvc.view_config",
    });
  }

  /**
   * Rename a temporary voice channel
   */
  async renameTempChannel(channel: VoiceChannel, newName: string): Promise<void> {
    await channel.setName(newName);
    log.info(`Renamed channel ${channel.id} to "${newName}"`);
    broadcastDashboardChange(channel.guild.id, "tempvc", "active_updated", {
      requiredAction: "tempvc.view_config",
    });
  }

  /**
   * Lock or unlock a temporary voice channel
   */
  async lockTempChannel(channel: VoiceChannel, lock: boolean, ownerId?: string): Promise<void> {
    const everyoneRole = channel.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyoneRole, {
      Connect: lock ? false : null,
    });

    if (ownerId) {
      await this.ensureOwnerPermissions(channel, ownerId);
    }

    log.info(`${lock ? "Locked" : "Unlocked"} channel ${channel.id}`);
  }

  /**
   * Set user limit for a temporary voice channel
   */
  async setUserLimit(channel: VoiceChannel, limit: number): Promise<void> {
    await channel.setUserLimit(limit);
    log.info(`Set user limit to ${limit} for channel ${channel.id}`);
    broadcastDashboardChange(channel.guild.id, "tempvc", "active_updated", {
      requiredAction: "tempvc.view_config",
    });
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

  // ==================== Permission Management ====================

  /**
   * Build permission overwrites for a new temp VC based on the opener's permission mode.
   */
  private async buildPermissionOverwrites(member: GuildMember, config: ChannelConfig, sourceChannel: VoiceChannel): Promise<OverwriteResolvable[]> {
    const overwrites: OverwriteResolvable[] = [this.createOwnerBaselineOverwrite(member.id)];

    const mode = config.permissionMode ?? "none";

    if (mode === "inherit_opener") {
      // Copy all permission overwrites from the opener (source) channel
      for (const [, overwrite] of sourceChannel.permissionOverwrites.cache) {
        if (overwrite.id === member.id) continue; // Skip — owner already added above
        overwrites.push({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow,
          deny: overwrite.deny,
        });
      }
      log.debug(`Applied inherit_opener permissions from ${sourceChannel.id} (${sourceChannel.permissionOverwrites.cache.size} overwrites)`);
    } else if (mode === "inherit_category") {
      // Copy all permission overwrites from the target category
      const category = member.guild.channels.cache.get(config.categoryId);
      if (category && "permissionOverwrites" in category) {
        for (const [, overwrite] of category.permissionOverwrites.cache) {
          if (overwrite.id === member.id) continue;
          overwrites.push({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow,
            deny: overwrite.deny,
          });
        }
        log.debug(`Applied inherit_category permissions from ${config.categoryId} (${category.permissionOverwrites.cache.size} overwrites)`);
      }
    } else if (mode === "custom" && config.roleOverrides?.length) {
      // Apply custom role overrides
      for (const ro of config.roleOverrides) {
        const allow: bigint[] = [];
        const deny: bigint[] = [];

        if (ro.view === "allow") allow.push(PermissionFlagsBits.ViewChannel);
        if (ro.view === "deny") deny.push(PermissionFlagsBits.ViewChannel);
        if (ro.connect === "allow") allow.push(PermissionFlagsBits.Connect);
        if (ro.connect === "deny") deny.push(PermissionFlagsBits.Connect);

        if (allow.length || deny.length) {
          overwrites.push({ id: ro.roleId, allow, deny });
        }
      }
      log.debug(`Applied ${config.roleOverrides.length} custom role overrides`);
    }

    return overwrites;
  }

  private createOwnerBaselineOverwrite(ownerId: string): OverwriteResolvable {
    return {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
      ],
    };
  }

  private async ensureOwnerPermissions(channel: VoiceChannel, ownerId: string): Promise<void> {
    await channel.permissionOverwrites.edit(ownerId, TempVCService.OWNER_BASELINE_PERMISSIONS);
  }

  /**
   * Invite users to a temp VC by granting them explicit View+Connect permissions.
   * Optionally DMs them a channel link if the opener has sendInviteDM enabled.
   */
  async inviteUsers(channel: VoiceChannel, userIds: string[], sendDM: boolean): Promise<{ invited: string[]; failed: string[] }> {
    const invited: string[] = [];
    const failed: string[] = [];

    for (const userId of userIds) {
      try {
        // Grant explicit view + connect permissions
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          Connect: true,
        });

        if (sendDM) {
          try {
            const user = await this.lib.thingGetter.getUser(userId);
            if (user) {
              const embed = this.lib
                .createEmbedBuilder()
                .setColor(0x57f287)
                .setTitle("📨 You've Been Invited!")
                .setDescription(`You have been invited to a voice channel!\n\n` + `**Channel:** <#${channel.id}>\n` + `**Server:** ${channel.guild.name}\n\n` + `Click the channel link above to join.`)
                .setTimestamp();
              await user.send({ embeds: [embed] }).catch(() => {
                log.debug(`Couldn't DM invite to ${userId} — DMs may be closed`);
              });
            }
          } catch {
            log.debug(`Failed to DM invite to ${userId}`);
          }
        }

        invited.push(userId);
      } catch (error) {
        log.error(`Failed to invite user ${userId} to ${channel.id}:`, error);
        failed.push(userId);
      }
    }

    log.info(`Invited ${invited.length} users to channel ${channel.id} (${failed.length} failed)`);
    return { invited, failed };
  }

  /**
   * Get the opener config for a given temp channel (resolves through openerMap → TempVC config).
   * Used by interaction handler to check per-opener settings like sendInviteDM.
   */
  async getOpenerConfig(guildId: string, channelId: string): Promise<ChannelConfig | null> {
    const openerId = await this.getOpenerForChannel(guildId, channelId);
    if (!openerId) return null;

    const guildConfig = await TempVC.findOne({ guildId }).lean();
    if (!guildConfig?.channels) return null;

    const opener = guildConfig.channels.find((c) => c.channelId === openerId);
    if (!opener) return null;

    return {
      channelId: opener.channelId,
      categoryId: opener.categoryId,
      useSequentialNames: opener.useSequentialNames ?? false,
      channelName: opener.channelName ?? "Temp VC",
      permissionMode: (opener as any).permissionMode ?? "none",
      roleOverrides: ((opener as any).roleOverrides ?? []).map((ro: any) => ({
        roleId: ro.roleId,
        view: ro.view ?? "neutral",
        connect: ro.connect ?? "neutral",
      })),
      sendInviteDM: (opener as any).sendInviteDM ?? false,
    };
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
