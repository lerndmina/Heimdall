/**
 * ModActionService — Central service for executing Discord moderation actions.
 *
 * Every action follows: execute → record infraction → DM user → log.
 */

import { type Guild, type GuildMember, type GuildTextBasedChannel, type Message, type TextChannel, Collection } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import type { LoggingPluginAPI } from "../../logging/index.js";
import { InfractionSource, InfractionType } from "../models/Infraction.js";
import type { InfractionService } from "./InfractionService.js";
import type { EscalationService } from "./EscalationService.js";
import { ACTION_COLORS, MAX_TIMEOUT_MS, PURGE_MAX_MESSAGES, BULK_DELETE_MAX_AGE_MS } from "../utils/constants.js";
import { sendInfractionDm, formatDuration, type TemplateVars } from "../utils/dm-templates.js";
import { combinedFilter, byNotTooOld } from "../utils/purge-filters.js";

const log = createLogger("moderation:actions");

export class ModActionService {
  private client: any;
  private lib: LibAPI;
  private logging: LoggingPluginAPI | null;
  private infractionService: InfractionService;
  private escalationService: EscalationService;

  constructor(client: any, lib: LibAPI, logging: LoggingPluginAPI | null, infractionService: InfractionService, escalationService: EscalationService) {
    this.client = client;
    this.lib = lib;
    this.logging = logging;
    this.infractionService = infractionService;
    this.escalationService = escalationService;
  }

  // ── Kick ───────────────────────────────────────────────

  async kick(guild: Guild, member: GuildMember, moderatorId: string, reason: string, points: number = 0): Promise<{ success: boolean; error?: string; activePoints?: number }> {
    try {
      // Fetch config for DM
      const config = await this.getConfig(guild.id);

      // DM before kick
      const vars = this.buildVars(member, guild, "Kick", reason, points, 0, moderatorId);
      if (config) await sendInfractionDm(member.user, config, vars);

      await member.kick(reason);

      // Record infraction
      const { activePoints } = await this.infractionService.recordInfraction({
        guildId: guild.id,
        userId: member.user.id,
        moderatorId,
        source: InfractionSource.MANUAL,
        type: InfractionType.KICK,
        reason,
        pointsAssigned: points,
      });

      // Log
      await this.sendModLog(
        guild,
        "mod_actions",
        this.lib
          .createEmbedBuilder()
          .setColor(ACTION_COLORS.kick)
          .setTitle("👢 Member Kicked")
          .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
          .addFields(
            { name: "User", value: `${member.user.tag} (${member.user})`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setFooter({ text: `User ID: ${member.user.id}` }),
      );

      return { success: true, activePoints };
    } catch (error) {
      log.error("Kick failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Ban ────────────────────────────────────────────────

  async ban(guild: Guild, userId: string, moderatorId: string, reason: string, deleteDays: number = 0, points: number = 0): Promise<{ success: boolean; error?: string; activePoints?: number }> {
    try {
      const config = await this.getConfig(guild.id);

      // DM before ban (can't DM after ban)
      const user = await this.lib.thingGetter.getUser(userId);
      if (user && config) {
        const vars = this.buildVars(null, guild, "Ban", reason, points, 0, moderatorId, user);
        await sendInfractionDm(user, config, vars);
      }

      await guild.bans.create(userId, {
        reason,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      });

      const { activePoints } = await this.infractionService.recordInfraction({
        guildId: guild.id,
        userId,
        moderatorId,
        source: InfractionSource.MANUAL,
        type: InfractionType.BAN,
        reason,
        pointsAssigned: points,
      });

      await this.sendModLog(
        guild,
        "mod_actions",
        this.lib
          .createEmbedBuilder()
          .setColor(ACTION_COLORS.ban)
          .setTitle("🔨 Member Banned")
          .setThumbnail(user?.displayAvatarURL({ size: 64 }) ?? null)
          .addFields(
            { name: "User", value: user ? `${user.tag} (${user})` : userId, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Delete Messages", value: `${deleteDays} day(s)`, inline: true },
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setFooter({ text: `User ID: ${userId}` }),
      );

      return { success: true, activePoints };
    } catch (error) {
      log.error("Ban failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Unban ──────────────────────────────────────────────

  async unban(guild: Guild, userId: string, moderatorId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      await guild.bans.remove(userId, reason);

      const user = await this.lib.thingGetter.getUser(userId);

      await this.sendModLog(
        guild,
        "mod_actions",
        this.lib
          .createEmbedBuilder()
          .setColor(ACTION_COLORS.unban)
          .setTitle("🔓 Member Unbanned")
          .setThumbnail(user?.displayAvatarURL({ size: 64 }) ?? null)
          .addFields(
            { name: "User", value: user ? `${user.tag} (${user})` : userId, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setFooter({ text: `User ID: ${userId}` }),
      );

      return { success: true };
    } catch (error) {
      log.error("Unban failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Mute (Timeout) ─────────────────────────────────────

  async mute(guild: Guild, member: GuildMember, moderatorId: string, duration: number, reason: string, points: number = 0): Promise<{ success: boolean; error?: string; activePoints?: number }> {
    if (duration > MAX_TIMEOUT_MS) {
      return { success: false, error: `Duration exceeds Discord's maximum of 28 days (${formatDuration(MAX_TIMEOUT_MS)})` };
    }

    try {
      const config = await this.getConfig(guild.id);

      const vars = this.buildVars(member, guild, "Timeout", reason, points, duration, moderatorId);
      if (config) await sendInfractionDm(member.user, config, vars);

      await member.timeout(duration, reason);

      const { activePoints } = await this.infractionService.recordInfraction({
        guildId: guild.id,
        userId: member.user.id,
        moderatorId,
        source: InfractionSource.MANUAL,
        type: InfractionType.MUTE,
        reason,
        pointsAssigned: points,
        duration,
      });

      await this.sendModLog(
        guild,
        "mod_actions",
        this.lib
          .createEmbedBuilder()
          .setColor(ACTION_COLORS.mute)
          .setTitle("🔇 Member Timed Out")
          .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
          .addFields(
            { name: "User", value: `${member.user.tag} (${member.user})`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Duration", value: formatDuration(duration), inline: true },
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setFooter({ text: `User ID: ${member.user.id}` }),
      );

      return { success: true, activePoints };
    } catch (error) {
      log.error("Mute failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Warn ───────────────────────────────────────────────

  async warn(
    guild: Guild,
    member: GuildMember,
    moderatorId: string,
    points: number,
    reason: string,
  ): Promise<{ success: boolean; error?: string; activePoints?: number; escalation?: { triggered: boolean; tierName?: string; action?: string } }> {
    try {
      const config = await this.getConfig(guild.id);

      const { activePoints } = await this.infractionService.recordInfraction({
        guildId: guild.id,
        userId: member.user.id,
        moderatorId,
        source: InfractionSource.MANUAL,
        type: InfractionType.WARN,
        reason,
        pointsAssigned: points,
      });

      // DM
      const vars = this.buildVars(member, guild, "Warning", reason, points, 0, moderatorId);
      vars.totalPoints = activePoints;
      if (config) await sendInfractionDm(member.user, config, vars);

      // Log
      await this.sendModLog(
        guild,
        "mod_actions",
        this.lib
          .createEmbedBuilder()
          .setColor(ACTION_COLORS.warn)
          .setTitle("⚠️ Member Warned")
          .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
          .addFields(
            { name: "User", value: `${member.user.tag} (${member.user})`, inline: true },
            { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
            { name: "Points", value: `+${points} (Total: ${activePoints})`, inline: true },
            { name: "Reason", value: reason || "No reason provided" },
          )
          .setFooter({ text: `User ID: ${member.user.id}` }),
      );

      // Check escalation
      let escalation = { triggered: false } as { triggered: boolean; tierName?: string; action?: string };
      if (config) {
        escalation = await this.escalationService.checkAndEscalate(guild, member, activePoints, config as any);
        if (escalation.triggered) {
          // Record escalation infraction
          await this.infractionService.recordInfraction({
            guildId: guild.id,
            userId: member.user.id,
            moderatorId: null,
            source: InfractionSource.MANUAL,
            type: InfractionType.ESCALATION,
            reason: `Escalation: ${escalation.tierName}`,
            escalationTriggered: escalation.tierName,
          });
        }
      }

      return { success: true, activePoints, escalation };
    } catch (error) {
      log.error("Warn failed:", error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ── Purge ──────────────────────────────────────────────

  async purge(
    channel: GuildTextBasedChannel,
    options: {
      limit?: number;
      before?: string;
      after?: string;
      filters?: Array<(message: Message) => boolean>;
    },
  ): Promise<{ deleted: number; skipped: number; error?: string }> {
    try {
      const maxMessages = Math.min(options.limit ?? PURGE_MAX_MESSAGES, PURGE_MAX_MESSAGES);
      const allFilters = [...(options.filters ?? []), byNotTooOld()];
      const messageFilter = combinedFilter(allFilters);

      let collected: Message[] = [];
      let lastId = options.before;
      let fetchedTotal = 0;

      // Fetch messages in batches of 100
      while (collected.length < maxMessages && fetchedTotal < maxMessages * 2) {
        const fetchOptions: { limit: number; before?: string; after?: string } = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;
        if (options.after && !lastId) fetchOptions.after = options.after;

        const fetched = await channel.messages.fetch(fetchOptions);
        if (fetched.size === 0) break;

        fetchedTotal += fetched.size;

        for (const [, msg] of fetched) {
          if (collected.length >= maxMessages) break;
          if (messageFilter(msg)) {
            collected.push(msg);
          }
        }

        lastId = fetched.last()?.id;
      }

      // Bulk delete in batches of 100
      let deleted = 0;
      let skipped = 0;

      for (let i = 0; i < collected.length; i += 100) {
        const batch = collected.slice(i, i + 100);
        const validBatch = batch.filter((m) => Date.now() - m.createdTimestamp < BULK_DELETE_MAX_AGE_MS);
        skipped += batch.length - validBatch.length;

        if (validBatch.length > 0) {
          if (validBatch.length === 1) {
            await validBatch[0]!.delete();
            deleted += 1;
          } else {
            const result = await channel.bulkDelete(validBatch, true);
            deleted += result.size;
          }
        }
      }

      return { deleted, skipped };
    } catch (error) {
      log.error("Purge failed:", error);
      return { deleted: 0, skipped: 0, error: (error as Error).message };
    }
  }

  // ── Helpers ────────────────────────────────────────────

  private async getConfig(guildId: string) {
    // Access moderation plugin API from client.plugins
    const modPlugin = this.client.plugins?.get("moderation") as { moderationService?: { getConfig: (id: string) => Promise<any> } } | undefined;
    return modPlugin?.moderationService?.getConfig(guildId) ?? null;
  }

  private buildVars(member: GuildMember | null, guild: Guild, action: string, reason: string, points: number, duration: number, moderatorId: string, user?: any): TemplateVars {
    const targetUser = member?.user ?? user;
    return {
      user: targetUser ? `${targetUser}` : "Unknown",
      username: targetUser?.username ?? "Unknown",
      server: guild.name,
      action,
      reason: reason || "No reason provided",
      points,
      totalPoints: points,
      moderator: `<@${moderatorId}>`,
      timestamp: new Date().toISOString(),
      duration: duration > 0 ? formatDuration(duration) : "N/A",
    };
  }

  async sendModLog(guild: Guild, subcategory: string, embed: any): Promise<void> {
    try {
      // Try logging plugin first
      if (this.logging) {
        try {
          if (subcategory === "automod") {
            const sent = await this.logging.eventService.sendAutomodLog(guild.id, embed);
            if (sent) return;
          } else {
            const sent = await this.logging.eventService.sendModActionLog(guild.id, embed);
            if (sent) return;
          }
        } catch {
          // Fall through to fallback
        }
      }

      // Fallback: try config log channel
      const config = await this.getConfig(guild.id);
      if (config?.logChannelId) {
        const channel = guild.channels.cache.get(config.logChannelId);
        if (channel?.isTextBased()) {
          await (channel as any).send({ embeds: [embed] });
        }
      }
    } catch (error) {
      log.error("Error sending mod log:", error);
    }
  }
}
