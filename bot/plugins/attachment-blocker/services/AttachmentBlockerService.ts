/**
 * AttachmentBlockerService — Config CRUD, resolution logic, and enforcement.
 *
 * Handles guild-wide configs, per-channel overrides, effective config resolution,
 * and enforcement actions (delete, timeout, DM).
 */

import { MessageFlags } from "discord.js";
import type { Message, GuildMember } from "discord.js";
import type { RedisClientType } from "redis";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import AttachmentBlockerConfig, { type IAttachmentBlockerConfig } from "../models/AttachmentBlockerConfig.js";
import AttachmentBlockerChannel, { type IAttachmentBlockerChannel } from "../models/AttachmentBlockerChannel.js";
import AttachmentBlockerOpener, { type IAttachmentBlockerOpener } from "../models/AttachmentBlockerOpener.js";
import { AttachmentType, isMimeTypeAllowed, AttachmentTypeLabels } from "../utils/attachment-types.js";
import { detectDisallowedLinks, getDetectedLinkTypes } from "../utils/link-detection.js";

const log = createLogger("attachment-blocker:service");

const CACHE_TTL = 300; // 5 minutes in seconds
const GUILD_CACHE_PREFIX = "attachment-blocker:guild:";
const CHANNEL_CACHE_PREFIX = "attachment-blocker:channel:";
const OPENER_CACHE_PREFIX = "attachment-blocker:opener:";

/** The resolved (merged) config for a specific channel */
export interface EffectiveConfig {
  enabled: boolean;
  allowedTypes: AttachmentType[];
  timeoutDuration: number;
  bypassRoleIds: string[];
  isChannelOverride: boolean;
}

type GuildConfigDoc = IAttachmentBlockerConfig & { _id: any; createdAt: Date; updatedAt: Date };
type ChannelConfigDoc = IAttachmentBlockerChannel & { _id: any; createdAt: Date; updatedAt: Date };
type OpenerConfigDoc = IAttachmentBlockerOpener & { _id: any; createdAt: Date; updatedAt: Date };

export class AttachmentBlockerService {
  private client: HeimdallClient;
  private redis: RedisClientType;
  private lib: LibAPI;

  constructor(client: HeimdallClient, redis: RedisClientType, lib: LibAPI) {
    this.client = client;
    this.redis = redis;
    this.lib = lib;
  }

  // ── Guild Config CRUD ──────────────────────────────────

  async getGuildConfig(guildId: string): Promise<GuildConfigDoc | null> {
    // Check Redis cache
    try {
      const cached = await this.redis.get(`${GUILD_CACHE_PREFIX}${guildId}`);
      if (cached) return JSON.parse(cached);
    } catch {
      /* cache miss */
    }

    const config = (await AttachmentBlockerConfig.findOne({ guildId }).lean()) as GuildConfigDoc | null;
    if (config) {
      try {
        await this.redis.setEx(`${GUILD_CACHE_PREFIX}${guildId}`, CACHE_TTL, JSON.stringify(config));
      } catch {
        /* cache write failure non-critical */
      }
    }
    return config;
  }

  async updateGuildConfig(guildId: string, updates: Partial<Pick<IAttachmentBlockerConfig, "enabled" | "defaultAllowedTypes" | "defaultTimeoutDuration" | "bypassRoleIds">>): Promise<GuildConfigDoc> {
    const config = (await AttachmentBlockerConfig.findOneAndUpdate({ guildId }, { $set: { ...updates, guildId } }, { upsert: true, new: true }).lean()) as GuildConfigDoc;

    // Invalidate cache
    await this.invalidateGuildCache(guildId);
    return config;
  }

  async deleteGuildConfig(guildId: string): Promise<boolean> {
    const result = await AttachmentBlockerConfig.deleteOne({ guildId });
    await this.invalidateGuildCache(guildId);
    return result.deletedCount > 0;
  }

  // ── Channel Config CRUD ────────────────────────────────

  async getChannelConfig(channelId: string): Promise<ChannelConfigDoc | null> {
    try {
      const cached = await this.redis.get(`${CHANNEL_CACHE_PREFIX}${channelId}`);
      if (cached) return JSON.parse(cached);
    } catch {
      /* cache miss */
    }

    const config = (await AttachmentBlockerChannel.findOne({ channelId }).lean()) as ChannelConfigDoc | null;
    if (config) {
      try {
        await this.redis.setEx(`${CHANNEL_CACHE_PREFIX}${channelId}`, CACHE_TTL, JSON.stringify(config));
      } catch {
        /* cache write failure non-critical */
      }
    }
    return config;
  }

  async getChannelConfigs(guildId: string): Promise<ChannelConfigDoc[]> {
    return AttachmentBlockerChannel.find({ guildId }).lean() as Promise<ChannelConfigDoc[]>;
  }

  async upsertChannelConfig(
    guildId: string,
    channelId: string,
    data: {
      allowedTypes?: AttachmentType[];
      timeoutDuration?: number | null;
      bypassRoleIds?: string[];
      enabled?: boolean;
      createdBy: string;
    },
  ): Promise<ChannelConfigDoc> {
    const updateData: Record<string, unknown> = {
      guildId,
      channelId,
      createdBy: data.createdBy,
    };

    if (data.allowedTypes !== undefined) updateData.allowedTypes = data.allowedTypes;
    if (data.timeoutDuration !== undefined) updateData.timeoutDuration = data.timeoutDuration ?? undefined;
    if (data.bypassRoleIds !== undefined) updateData.bypassRoleIds = data.bypassRoleIds;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    const config = (await AttachmentBlockerChannel.findOneAndUpdate({ channelId }, { $set: updateData }, { upsert: true, new: true }).lean()) as ChannelConfigDoc;

    await this.invalidateChannelCache(channelId);
    return config;
  }

  async deleteChannelConfig(channelId: string): Promise<boolean> {
    const result = await AttachmentBlockerChannel.deleteOne({ channelId });
    await this.invalidateChannelCache(channelId);
    return result.deletedCount > 0;
  }

  async deleteAllChannelConfigs(guildId: string): Promise<number> {
    const channels = await AttachmentBlockerChannel.find({ guildId }, { channelId: 1 }).lean();
    const result = await AttachmentBlockerChannel.deleteMany({ guildId });

    // Invalidate all channel caches
    for (const ch of channels) {
      await this.invalidateChannelCache(ch.channelId);
    }
    return result.deletedCount;
  }

  // ── Opener Config CRUD (TempVC integration) ────────────

  async getOpenerConfig(openerChannelId: string): Promise<OpenerConfigDoc | null> {
    try {
      const cached = await this.redis.get(`${OPENER_CACHE_PREFIX}${openerChannelId}`);
      if (cached) return JSON.parse(cached);
    } catch {
      /* cache miss */
    }

    const config = (await AttachmentBlockerOpener.findOne({ openerChannelId }).lean()) as OpenerConfigDoc | null;
    if (config) {
      try {
        await this.redis.setEx(`${OPENER_CACHE_PREFIX}${openerChannelId}`, CACHE_TTL, JSON.stringify(config));
      } catch {
        /* cache write failure non-critical */
      }
    }
    return config;
  }

  async getOpenerConfigs(guildId: string): Promise<OpenerConfigDoc[]> {
    return AttachmentBlockerOpener.find({ guildId }).lean() as Promise<OpenerConfigDoc[]>;
  }

  async upsertOpenerConfig(
    guildId: string,
    openerChannelId: string,
    data: {
      allowedTypes?: AttachmentType[];
      timeoutDuration?: number | null;
      enabled?: boolean;
      createdBy: string;
    },
  ): Promise<OpenerConfigDoc> {
    const updateData: Record<string, unknown> = {
      guildId,
      openerChannelId,
      createdBy: data.createdBy,
    };

    if (data.allowedTypes !== undefined) updateData.allowedTypes = data.allowedTypes;
    if (data.timeoutDuration !== undefined) updateData.timeoutDuration = data.timeoutDuration ?? undefined;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    const config = (await AttachmentBlockerOpener.findOneAndUpdate({ openerChannelId }, { $set: updateData }, { upsert: true, new: true }).lean()) as OpenerConfigDoc;

    await this.invalidateOpenerCache(openerChannelId);
    return config;
  }

  async deleteOpenerConfig(openerChannelId: string): Promise<boolean> {
    const result = await AttachmentBlockerOpener.deleteOne({ openerChannelId });
    await this.invalidateOpenerCache(openerChannelId);
    return result.deletedCount > 0;
  }

  // ── Effective Config Resolution ────────────────────────

  /**
   * Resolve the effective config for a channel by merging guild defaults
   * with any per-channel overrides, or opener-level rules for temp VCs.
   *
   * Resolution order:
   * 1. Per-channel override (explicit — highest priority)
   * 2. TempVC opener override (if channel is an active temp VC)
   * 3. Guild defaults (fallback)
   */
  async resolveEffectiveConfig(guildId: string, channelId: string): Promise<EffectiveConfig> {
    const [guildConfig, channelConfig] = await Promise.all([this.getGuildConfig(guildId), this.getChannelConfig(channelId)]);

    // No guild config at all → feature is disabled
    if (!guildConfig) {
      return {
        enabled: false,
        allowedTypes: [],
        timeoutDuration: 0,
        bypassRoleIds: [],
        isChannelOverride: false,
      };
    }

    // Explicit per-channel override takes highest priority
    if (channelConfig) {
      const bypassRoleIds = [...new Set([...(guildConfig.bypassRoleIds ?? []), ...(channelConfig.bypassRoleIds ?? [])])];
      return {
        enabled: channelConfig.enabled && guildConfig.enabled,
        allowedTypes: (channelConfig.allowedTypes && channelConfig.allowedTypes.length > 0 ? channelConfig.allowedTypes : guildConfig.defaultAllowedTypes) as AttachmentType[],
        timeoutDuration: channelConfig.timeoutDuration ?? guildConfig.defaultTimeoutDuration,
        bypassRoleIds,
        isChannelOverride: true,
      };
    }

    // Check if this is a temp VC — resolve opener rules
    const openerConfig = await this.resolveOpenerConfig(guildId, channelId, guildConfig);
    if (openerConfig) return openerConfig;

    // No overrides → use guild defaults
    return {
      enabled: guildConfig.enabled,
      allowedTypes: guildConfig.defaultAllowedTypes as AttachmentType[],
      timeoutDuration: guildConfig.defaultTimeoutDuration,
      bypassRoleIds: guildConfig.bypassRoleIds ?? [],
      isChannelOverride: false,
    };
  }

  /**
   * If channelId is an active temp VC, look up which opener spawned it
   * and return the opener's attachment rules merged with guild defaults.
   */
  private async resolveOpenerConfig(guildId: string, channelId: string, guildConfig: GuildConfigDoc): Promise<EffectiveConfig | null> {
    try {
      // Get tempvc plugin to check opener mapping
      const tempvcPlugin = this.client.plugins?.get("tempvc") as { tempVCService: { getOpenerForChannel(guildId: string, channelId: string): Promise<string | null> } } | undefined;
      if (!tempvcPlugin?.tempVCService) {
        log.debug(`resolveOpenerConfig: tempvc plugin not available`);
        return null;
      }

      const openerId = await tempvcPlugin.tempVCService.getOpenerForChannel(guildId, channelId);
      if (!openerId) {
        log.debug(`resolveOpenerConfig: channel ${channelId} is not a temp VC (no opener found)`);
        return null;
      }

      log.debug(`resolveOpenerConfig: channel ${channelId} spawned by opener ${openerId}`);

      const openerConfig = await this.getOpenerConfig(openerId);
      if (!openerConfig) {
        log.debug(`resolveOpenerConfig: no attachment blocker config for opener ${openerId}`);
        return null;
      }

      log.debug(`resolveOpenerConfig: found opener config — enabled=${openerConfig.enabled}, types=${openerConfig.allowedTypes?.join(",")}`);

      return {
        enabled: openerConfig.enabled && guildConfig.enabled,
        allowedTypes: (openerConfig.allowedTypes && openerConfig.allowedTypes.length > 0 ? openerConfig.allowedTypes : guildConfig.defaultAllowedTypes) as AttachmentType[],
        timeoutDuration: openerConfig.timeoutDuration ?? guildConfig.defaultTimeoutDuration,
        bypassRoleIds: guildConfig.bypassRoleIds ?? [],
        isChannelOverride: true,
      };
    } catch (error) {
      log.debug("Failed to resolve opener config (tempvc plugin may not be loaded):", error);
      return null;
    }
  }

  // ── Enforcement ────────────────────────────────────────

  /**
   * Check a message against the effective config and enforce if needed.
   * Returns true if the message was blocked.
   */
  async checkAndEnforce(message: Message): Promise<boolean> {
    if (!message.guild || !message.guildId) return false;
    if (message.author.bot) return false;

    // Skip voice messages — they're handled by vc-transcription, not regular uploads
    if (message.flags.has(MessageFlags.IsVoiceMessage)) return false;

    const effectiveConfig = await this.resolveEffectiveConfig(message.guildId, message.channel.id);

    // Role bypass (global + channel additive)
    const member = message.member || (await this.lib.thingGetter.getMember(message.guild, message.author.id));
    if (member && this.hasBypassRole(member as GuildMember, effectiveConfig.bypassRoleIds)) {
      return false;
    }

    // Not enabled or ALL allowed → pass through
    if (!effectiveConfig.enabled) return false;
    if (effectiveConfig.allowedTypes.includes(AttachmentType.ALL)) return false;

    const isNoneSet = effectiveConfig.allowedTypes.includes(AttachmentType.NONE);

    // Skip if no attachments, no content to check, and NONE is not set
    if (!isNoneSet && message.attachments.size === 0 && !message.content) return false;

    let shouldDelete = false;
    const blockedReasons: string[] = [];

    // Check each attachment
    for (const [, attachment] of message.attachments.entries()) {
      const mimeType = attachment.contentType?.toLowerCase() || "";

      if (isNoneSet) {
        shouldDelete = true;
        if (blockedReasons.length < 1) blockedReasons.push("No attachments allowed");
        continue;
      }

      if (!isMimeTypeAllowed(mimeType, effectiveConfig.allowedTypes)) {
        shouldDelete = true;
        if (blockedReasons.length < 1) {
          blockedReasons.push(`Attachment type not allowed: ${mimeType}`);
        } else {
          blockedReasons.push(mimeType);
        }
      }
    }

    // Check for media links (GIF links vs video links checked independently)
    if (!isNoneSet && message.content) {
      const disallowed = detectDisallowedLinks(message.content, effectiveConfig.allowedTypes);
      if (disallowed) {
        shouldDelete = true;
        const linkTypes = getDetectedLinkTypes(disallowed.links);
        if (blockedReasons.length < 1) {
          blockedReasons.push(`${linkTypes} not allowed`);
        } else {
          blockedReasons.push(linkTypes);
        }
      }
    } else if (isNoneSet && message.content) {
      const disallowed = detectDisallowedLinks(message.content, []);
      if (disallowed) {
        shouldDelete = true;
        const linkTypes = getDetectedLinkTypes(disallowed.links);
        if (blockedReasons.length < 1) {
          blockedReasons.push(`${linkTypes} not allowed`);
        } else {
          blockedReasons.push(linkTypes);
        }
      }
    }

    // Enforce
    if (shouldDelete && message.deletable) {
      try {
        await message.delete();

        // Timeout if configured
        if (effectiveConfig.timeoutDuration > 0) {
          try {
            const member = message.member || (await this.lib.thingGetter.getMember(message.guild, message.author.id));
            if (member) {
              await (member as GuildMember).timeout(effectiveConfig.timeoutDuration, `AttachmentBlocker: ${blockedReasons.join(", ")}`);
            }
          } catch (e) {
            log.error("Error timing out user", e);
          }
        }

        // DM the user
        try {
          const embed = this.lib
            .createEmbedBuilder()
            .setColor(0xff4444)
            .setTitle("⚠️ Attachment Blocker")
            .setDescription(
              `Your message in <#${message.channel.id}> was removed.\n` +
                `**Reason:** ${blockedReasons.join(", ")}` +
                (effectiveConfig.timeoutDuration > 0 ? `\n\nYou have been timed out for ${effectiveConfig.timeoutDuration / 1000} seconds.` : ""),
            )
            .setTimestamp();

          await message.author.send({ embeds: [embed] });
        } catch {
          log.debug(`Couldn't DM user ${message.author.tag} about blocked attachment`);
        }

        log.info(`Blocked content from ${message.author.tag} in #${(message.channel as any).name ?? message.channel.id}: ${blockedReasons.join(", ")}`);
        return true;
      } catch (error) {
        log.error("Error deleting message with blocked content", error);
      }
    }

    return false;
  }

  private hasBypassRole(member: GuildMember, bypassRoleIds: string[]): boolean {
    if (!bypassRoleIds || bypassRoleIds.length === 0) return false;
    return bypassRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  // ── Cache Helpers ──────────────────────────────────────

  private async invalidateGuildCache(guildId: string): Promise<void> {
    try {
      await this.redis.del(`${GUILD_CACHE_PREFIX}${guildId}`);
    } catch {
      /* non-critical */
    }
  }

  private async invalidateChannelCache(channelId: string): Promise<void> {
    try {
      await this.redis.del(`${CHANNEL_CACHE_PREFIX}${channelId}`);
    } catch {
      /* non-critical */
    }
  }

  private async invalidateOpenerCache(openerChannelId: string): Promise<void> {
    try {
      await this.redis.del(`${OPENER_CACHE_PREFIX}${openerChannelId}`);
    } catch {
      /* non-critical */
    }
  }
}
