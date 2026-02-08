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
import { ACTION_COLORS, MAX_TIMEOUT_MS } from "../utils/constants.js";
import { formatDuration } from "../utils/dm-templates.js";

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
   * Returns info about which tier (if any) was triggered.
   * The actual infraction recording is done by the caller.
   */
  async checkAndEscalate(guild: Guild, member: GuildMember, currentPoints: number, config: ConfigDoc): Promise<EscalationResult> {
    if (!config.escalationTiers || config.escalationTiers.length === 0) {
      return { triggered: false };
    }

    // Sort tiers by threshold descending to find the highest applicable tier
    const sortedTiers = [...config.escalationTiers].sort((a, b) => (b.pointsThreshold ?? 0) - (a.pointsThreshold ?? 0));

    for (const tier of sortedTiers) {
      if (currentPoints >= (tier.pointsThreshold ?? Infinity)) {
        try {
          await this.executeEscalation(guild, member, tier as any, config);
          return {
            triggered: true,
            tierName: tier.name ?? "Unknown",
            action: tier.action ?? "unknown",
          };
        } catch (error) {
          log.error(`Failed to execute escalation tier "${tier.name}":`, error);
          return { triggered: false };
        }
      }
    }

    return { triggered: false };
  }

  private async executeEscalation(guild: Guild, member: GuildMember, tier: { name: string; action: string; duration?: number | null }, config: ConfigDoc): Promise<void> {
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
      default:
        log.warn(`Unknown escalation action: ${tier.action}`);
    }

    // Send escalation log
    await this.sendEscalationLog(guild, member, tier, config);
  }

  private async sendEscalationLog(guild: Guild, member: GuildMember, tier: { name: string; action: string; duration?: number | null }, config: ConfigDoc): Promise<void> {
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
