/**
 * AutomodEnforcer — Automod event → check → enforce pipeline.
 *
 * Handles messages, reactions, member joins, and nickname changes by
 * checking rules, executing actions, recording infractions, and logging.
 */

import type { Message, MessageReaction, PartialMessageReaction, GuildMember, PartialGuildMember, User, PartialUser } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import type { LoggingPluginAPI } from "../../logging/index.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import { AutomodAction, type IAutomodRule } from "../models/AutomodRule.js";
import { InfractionSource, InfractionType } from "../models/Infraction.js";
import type { ModerationService } from "./ModerationService.js";
import type { RuleEngine, RuleMatch } from "./RuleEngine.js";
import type { InfractionService } from "./InfractionService.js";
import type { EscalationService } from "./EscalationService.js";
import type { ModActionService } from "./ModActionService.js";
import { ACTION_COLORS, MAX_TIMEOUT_MS } from "../utils/constants.js";
import { sendInfractionDm, formatDuration, type TemplateVars } from "../utils/dm-templates.js";

const log = createLogger("moderation:automod");

type RuleDoc = IAutomodRule & { _id: any };

export class AutomodEnforcer {
  private client: HeimdallClient;
  private lib: LibAPI;
  private logging: LoggingPluginAPI | null;
  private moderationService: ModerationService;
  private ruleEngine: RuleEngine;
  private infractionService: InfractionService;
  private escalationService: EscalationService;
  private modActionService: ModActionService;

  constructor(
    client: HeimdallClient,
    lib: LibAPI,
    logging: LoggingPluginAPI | null,
    moderationService: ModerationService,
    ruleEngine: RuleEngine,
    infractionService: InfractionService,
    escalationService: EscalationService,
    modActionService: ModActionService,
  ) {
    this.client = client;
    this.lib = lib;
    this.logging = logging;
    this.moderationService = moderationService;
    this.ruleEngine = ruleEngine;
    this.infractionService = infractionService;
    this.escalationService = escalationService;
    this.modActionService = modActionService;
  }

  // ── Message Handler ────────────────────────────────────

  async handleMessage(message: Message): Promise<void> {
    try {
      if (message.author.bot || !message.guild) return;

      const guildId = message.guild.id;
      const config = await this.moderationService.getConfig(guildId);
      if (!config?.automodEnabled) return;

      // Check immune roles
      const member = message.member;
      if (!member) return;
      if (this.isImmune(member, config.immuneRoles as string[])) return;

      const rules = await this.moderationService.getEnabledRules(guildId);
      if (rules.length === 0) return;

      // Filter by channel/role scoping
      const scopedRules = rules.filter((r) => this.isInScope(r, message.channelId, member));

      const match = this.ruleEngine.evaluateMessage(message, scopedRules);
      if (!match) return;

      await this.enforceRule(message, member, match, config as any);
    } catch (error) {
      log.error("handleMessage error:", error);
    }
  }

  // ── Reaction Handler ───────────────────────────────────

  async handleReaction(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
    try {
      if (user.bot) return;

      // Fetch partial reaction if needed
      if (reaction.partial) {
        try {
          reaction = await reaction.fetch();
        } catch {
          return;
        }
      }

      const message = reaction.message;
      if (!message.guild) return;

      const guildId = message.guild.id;
      const config = await this.moderationService.getConfig(guildId);
      if (!config?.automodEnabled) return;

      const member = await this.lib.thingGetter.getMember(message.guild, user.id);
      if (!member) return;
      if (this.isImmune(member, config.immuneRoles as string[])) return;

      const rules = await this.moderationService.getEnabledRules(guildId);
      const match = this.ruleEngine.evaluateReaction(reaction, rules);
      if (!match) return;

      // Execute actions
      const actions = match.rule.actions as string[];

      if (actions.includes(AutomodAction.REMOVE_REACTION)) {
        try {
          // Remove ALL reactions of this emoji from the message, not just the user's
          await reaction.remove();
        } catch (err) {
          log.error("Failed to remove reaction:", err);
        }
      }

      // Record and enforce
      await this.recordAndEscalate(guildId, member, match, InfractionType.AUTOMOD_REACTION, message.channelId, message.id, config as any);
    } catch (error) {
      log.error("handleReaction error:", error);
    }
  }

  // ── Member Join Handler ────────────────────────────────

  async handleMemberJoin(member: GuildMember): Promise<void> {
    try {
      if (member.user.bot) return;

      const guildId = member.guild.id;
      const config = await this.moderationService.getConfig(guildId);
      if (!config?.automodEnabled) return;

      const rules = await this.moderationService.getEnabledRules(guildId);
      const match = this.ruleEngine.evaluateMember(member, rules, "username");
      if (!match) return;

      await this.recordAndEscalate(guildId, member, match, InfractionType.AUTOMOD_USERNAME, null, null, config as any);
    } catch (error) {
      log.error("handleMemberJoin error:", error);
    }
  }

  // ── Member Update Handler (Nickname Change) ────────────

  async handleMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
    try {
      if (newMember.user.bot) return;
      if (oldMember.nickname === newMember.nickname) return;

      const guildId = newMember.guild.id;
      const config = await this.moderationService.getConfig(guildId);
      if (!config?.automodEnabled) return;
      if (this.isImmune(newMember, config.immuneRoles as string[])) return;

      const rules = await this.moderationService.getEnabledRules(guildId);
      const match = this.ruleEngine.evaluateMember(newMember, rules, "nickname");
      if (!match) return;

      await this.recordAndEscalate(guildId, newMember, match, InfractionType.AUTOMOD_USERNAME, null, null, config as any);
    } catch (error) {
      log.error("handleMemberUpdate error:", error);
    }
  }

  // ── Core Enforcement ───────────────────────────────────

  private async enforceRule(message: Message, member: GuildMember, match: RuleMatch, config: any): Promise<void> {
    const actions = match.rule.actions as string[];
    const guildId = message.guild!.id;

    // Delete message
    if (actions.includes(AutomodAction.DELETE)) {
      try {
        await message.delete();
      } catch (err) {
        log.error("Failed to delete message:", err);
      }
    }

    // Timeout
    if (actions.includes(AutomodAction.TIMEOUT)) {
      const duration = Math.min((match.rule.timeoutDuration as number) ?? 60000, MAX_TIMEOUT_MS);
      try {
        await member.timeout(duration, `Automod: ${match.rule.name}`);
      } catch (err) {
        log.error("Failed to timeout member:", err);
      }
    }

    // Kick
    if (actions.includes(AutomodAction.KICK)) {
      try {
        await member.kick(`Automod: ${match.rule.name}`);
      } catch (err) {
        log.error("Failed to kick member:", err);
      }
    }

    // Ban
    if (actions.includes(AutomodAction.BAN)) {
      try {
        await message.guild!.bans.create(member.user.id, {
          reason: `Automod: ${match.rule.name}`,
          deleteMessageSeconds: 0,
        });
      } catch (err) {
        log.error("Failed to ban member:", err);
      }
    }

    // Record infraction + check escalation (only if warn action present or points > 0)
    await this.recordAndEscalate(guildId, member, match, InfractionType.AUTOMOD_DELETE, message.channelId, message.id, config);
  }

  private async recordAndEscalate(guildId: string, member: GuildMember, match: RuleMatch, type: InfractionType, channelId: string | null, messageId: string | null, config: any): Promise<void> {
    const actions = match.rule.actions as string[];
    const points = actions.includes(AutomodAction.WARN) ? (match.rule.warnPoints ?? 1) : 0;

    // Record infraction
    const { activePoints } = await this.infractionService.recordInfraction({
      guildId,
      userId: member.user.id,
      source: InfractionSource.AUTOMOD,
      type,
      reason: `Automod rule: ${match.rule.name}`,
      ruleId: String(match.rule._id),
      ruleName: match.rule.name as string,
      matchedContent: match.matchedContent,
      matchedPattern: match.matchedPattern,
      pointsAssigned: points,
      channelId,
      messageId,
    });

    // DM user
    if (actions.includes(AutomodAction.DM) || actions.includes(AutomodAction.WARN)) {
      const vars: TemplateVars = {
        user: `${member.user}`,
        username: member.user.username,
        server: member.guild.name,
        rule: match.rule.name as string,
        channel: channelId ? `<#${channelId}>` : "N/A",
        points,
        totalPoints: activePoints,
        action: "Automod",
        reason: `Rule violation: ${match.rule.name}`,
        matchedContent: match.matchedContent,
        timestamp: new Date().toISOString(),
      };

      await sendInfractionDm(member.user, config, vars, match.rule as any);
    }

    // Log
    if (actions.includes(AutomodAction.LOG)) {
      await this.sendAutomodLog(member.guild, member, match, activePoints, channelId, messageId);
    }

    // Check escalation
    if (points > 0 && config.escalationTiers?.length > 0) {
      const escalation = await this.escalationService.checkAndEscalate(member.guild, member, activePoints, config);

      if (escalation.triggered) {
        await this.infractionService.recordInfraction({
          guildId,
          userId: member.user.id,
          source: InfractionSource.AUTOMOD,
          type: InfractionType.ESCALATION,
          reason: `Escalation: ${escalation.tierName}`,
          escalationTriggered: escalation.tierName,
        });
      }
    }
  }

  // ── Logging ────────────────────────────────────────────

  private async sendAutomodLog(guild: any, member: GuildMember, match: RuleMatch, activePoints: number, channelId: string | null, messageId: string | null): Promise<void> {
    try {
      // Build context line with links based on trigger type
      const contextParts: string[] = [];
      if (channelId) {
        contextParts.push(`Channel: <#${channelId}>`);
        if (messageId) {
          contextParts.push(`[Jump to message](https://discord.com/channels/${guild.id}/${channelId}/${messageId})`);
        }
      }
      const contextValue = contextParts.length > 0 ? contextParts.join(" · ") : "N/A";

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(ACTION_COLORS.automod)
        .setTitle("🤖 Automod Triggered")
        .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
        .addFields(
          { name: "User", value: `${member.user.tag} (${member.user})`, inline: true },
          { name: "Rule", value: match.rule.name as string, inline: true },
          { name: "Points", value: `+${match.rule.warnPoints ?? 0} (Total: ${activePoints})`, inline: true },
          { name: "Context", value: contextValue },
          { name: "Matched Content", value: match.matchedContent?.substring(0, 200) || "N/A" },
          { name: "Actions", value: (match.rule.actions as string[]).join(", ") },
        )
        .setFooter({ text: `User ID: ${member.user.id}` })
        .setTimestamp();

      await this.modActionService.sendModLog(guild, "automod", embed);
    } catch (error) {
      log.error("Error sending automod log:", error);
    }
  }

  // ── Scoping Helpers ────────────────────────────────────

  private isImmune(member: GuildMember, immuneRoles: string[]): boolean {
    if (!immuneRoles || immuneRoles.length === 0) return false;
    return member.roles.cache.some((r) => immuneRoles.includes(r.id));
  }

  private isInScope(rule: RuleDoc, channelId: string, member: GuildMember): boolean {
    // Channel scoping
    const channelInclude = (rule.channelInclude ?? []) as string[];
    const channelExclude = (rule.channelExclude ?? []) as string[];

    if (channelInclude.length > 0 && !channelInclude.includes(channelId)) return false;
    if (channelExclude.includes(channelId)) return false;

    // Role scoping
    const roleInclude = (rule.roleInclude ?? []) as string[];
    const roleExclude = (rule.roleExclude ?? []) as string[];

    if (roleInclude.length > 0 && !member.roles.cache.some((r) => roleInclude.includes(r.id))) return false;
    if (member.roles.cache.some((r) => roleExclude.includes(r.id))) return false;

    return true;
  }
}
