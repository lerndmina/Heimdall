/**
 * EscalationService — Threshold checks and automatic action execution.
 *
 * When a user's points cross an escalation tier threshold, the corresponding
 * action (timeout/kick/ban) is automatically executed.
 */

import type { Guild, GuildMember } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import type { LoggingPluginAPI } from "../../logging/index.js";
import type { IModerationConfig } from "../models/ModerationConfig.js";
import Infraction, { InfractionType } from "../models/Infraction.js";
import { ACTION_COLORS, MAX_TIMEOUT_MS } from "../utils/constants.js";
import { formatDuration, renderTemplate, type TemplateVars } from "../utils/dm-templates.js";

const log = createLogger("moderation:escalation");

type ConfigDoc = IModerationConfig & { _id: any };

export interface EscalationResult {
  triggered: boolean;
  tierName?: string;
  action?: string;
}

export class EscalationService {
  private lib: LibAPI;
  private logging: LoggingPluginAPI | null;

  constructor(lib: LibAPI, logging: LoggingPluginAPI | null) {
    this.lib = lib;
    this.logging = logging;
  }

  /**
   * Check if current points cross any escalation tier and execute the action.
   *
   * Skips tiers that have already been triggered for this user (tracked via
   * active ESCALATION infractions). This ensures each tier fires at most once
   * per point-decay window, allowing multiple escalation tiers to work correctly
   * (e.g. 5pts → timeout, 10pts → kick, 15pts → ban).
   *
   * Returns info about which tier (if any) was triggered.
   * The actual infraction recording is done by the caller.
   */
  async checkAndEscalate(guild: Guild, member: GuildMember, currentPoints: number, config: ConfigDoc): Promise<EscalationResult> {
    if (!config.escalationTiers || config.escalationTiers.length === 0) {
      return { triggered: false };
    }

    // Find which tiers have already been triggered for this user (active escalation infractions)
    const alreadyTriggered = await this.getTriggeredTiers(guild.id, member.user.id);

    // Sort tiers by threshold descending to find the highest applicable tier
    const sortedTiers = [...config.escalationTiers].sort((a, b) => (b.pointsThreshold ?? 0) - (a.pointsThreshold ?? 0));

    // Find the single highest tier the user qualifies for — only that tier matters.
    // If it's already been triggered, do NOT fall through to lower tiers.
    const applicableTier = sortedTiers.find((tier) => currentPoints >= (tier.pointsThreshold ?? Infinity));
    if (!applicableTier) return { triggered: false };

    // Already triggered this tier — don't re-fire or fall through
    if (alreadyTriggered.has(applicableTier.name ?? "")) {
      return { triggered: false };
    }

    try {
      await this.executeEscalation(guild, member, applicableTier as any, config);
      return {
        triggered: true,
        tierName: applicableTier.name ?? "Unknown",
        action: applicableTier.action ?? "unknown",
      };
    } catch (error) {
      log.error(`Failed to execute escalation tier "${applicableTier.name}":`, error);
      return { triggered: false };
    }
  }

  /**
   * Get the set of escalation tier names that have already been triggered
   * for a user. Only considers active, non-expired escalation infractions
   * so that tiers can re-fire after points decay and re-accumulate.
   */
  private async getTriggeredTiers(guildId: string, userId: string): Promise<Set<string>> {
    try {
      const now = new Date();
      const docs = await Infraction.find({
        guildId,
        userId,
        type: InfractionType.ESCALATION,
        active: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
        .select("escalationTriggered")
        .lean();

      const names = new Set<string>();
      for (const doc of docs) {
        if (doc.escalationTriggered) names.add(doc.escalationTriggered as string);
      }
      return names;
    } catch (error) {
      log.error("Error fetching triggered tiers:", error);
      return new Set();
    }
  }

  private async executeEscalation(guild: Guild, member: GuildMember, tier: { name: string; action: string; duration?: number | null; dmMessage?: string | null }, config: ConfigDoc): Promise<void> {
    const reason = `Escalation: ${tier.name} (points threshold reached)`;

    switch (tier.action) {
      case "timeout": {
        const duration = Math.min(tier.duration ?? 60 * 60 * 1000, MAX_TIMEOUT_MS);
        await member.timeout(duration, reason);
        log.info(`Escalation: timed out ${member.user.tag} in ${guild.name} for ${formatDuration(duration)}`);
        break;
      }
      case "kick": {
        await member.kick(reason);
        log.info(`Escalation: kicked ${member.user.tag} from ${guild.name}`);
        break;
      }
      case "ban": {
        await guild.bans.create(member.user.id, { reason, deleteMessageSeconds: 0 });
        log.info(`Escalation: banned ${member.user.tag} from ${guild.name}`);
        break;
      }
      case "dm": {
        const template = tier.dmMessage ?? "You have reached a moderation threshold in **{server}**.\n\n**Tier:** {tier}\n**Action:** DM Warning";
        const vars: TemplateVars = {
          user: `${member.user}`,
          username: member.user.username,
          server: guild.name,
          rule: tier.name,
          action: "Escalation DM",
          reason,
          timestamp: new Date().toISOString(),
        };
        // Also provide {tier} as a substitution
        const rendered = renderTemplate(template, { ...vars }).replace(/\{tier\}/g, tier.name);
        try {
          await member.user.send({ content: rendered });
          log.info(`Escalation: sent DM to ${member.user.tag} in ${guild.name} for tier "${tier.name}"`);
        } catch (err) {
          const error = err as { code?: number };
          if (error.code === 50007) {
            log.debug(`Cannot DM user ${member.user.id} — DMs disabled`);
          } else {
            log.error(`Failed to DM user ${member.user.id}:`, err);
          }
        }
        break;
      }
      default:
        log.warn(`Unknown escalation action: ${tier.action}`);
    }

    // Send escalation log
    await this.sendEscalationLog(guild, member, tier, config);
  }

  private async sendEscalationLog(guild: Guild, member: GuildMember, tier: { name: string; action: string; duration?: number | null; dmMessage?: string | null }, config: ConfigDoc): Promise<void> {
    try {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(ACTION_COLORS.escalation)
        .setTitle("⚡ Escalation Triggered")
        .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
        .addFields(
          { name: "User", value: `${member.user.tag} (${member.user})`, inline: true },
          { name: "Tier", value: tier.name, inline: true },
          { name: "Action", value: tier.action.charAt(0).toUpperCase() + tier.action.slice(1), inline: true },
        )
        .setFooter({ text: `User ID: ${member.user.id}` })
        .setTimestamp();

      if (tier.action === "timeout" && tier.duration) {
        embed.addFields({ name: "Duration", value: formatDuration(tier.duration), inline: true });
      }

      // Try logging plugin first
      if (this.logging) {
        try {
          const sent = await this.logging.eventService.sendModActionLog(guild.id, embed);
          if (sent) return;
        } catch {
          // Fall through to fallback
        }
      }

      // Fallback to config log channel
      if (config.logChannelId) {
        const channel = guild.channels.cache.get(config.logChannelId);
        if (channel?.isTextBased()) {
          await (channel as any).send({ embeds: [embed] });
        }
      }
    } catch (error) {
      log.error("Error sending escalation log:", error);
    }
  }
}
