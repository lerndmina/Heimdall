/**
 * RuleEngine — Regex matching logic for automod evaluation.
 *
 * Compiles and caches RegExp objects, evaluates messages/reactions/members
 * against rules sorted by priority, with target-specific content extraction.
 */

import type { Message, MessageReaction, GuildMember, PartialMessageReaction } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import { AutomodTarget, type IAutomodRule } from "../models/AutomodRule.js";
import { testPatterns, extractEmoji, extractUrls, extractStickerNames } from "../utils/regex-engine.js";

const log = createLogger("moderation:rule-engine");

type RuleDoc = IAutomodRule & { _id: any };

export interface RuleMatch {
  rule: RuleDoc;
  matchedContent: string;
  matchedPattern: string;
}

export class RuleEngine {
  /**
   * Evaluate a message against all applicable rules.
   * Returns the first matching rule (highest priority) or null.
   * A rule is applicable if ANY of its targets are message-applicable.
   */
  evaluateMessage(message: Message, rules: RuleDoc[]): RuleMatch | null {
    // Filter to message-applicable targets
    const messageTargets = new Set([AutomodTarget.MESSAGE_CONTENT, AutomodTarget.MESSAGE_EMOJI, AutomodTarget.STICKER, AutomodTarget.LINK]);

    const applicableRules = rules
      .filter((r) => r.enabled && (r.target as unknown as string[]).some((t) => messageTargets.has(t as AutomodTarget)))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const rule of applicableRules) {
      // Try each of the rule's targets that apply to messages
      const ruleTargets = (rule.target as unknown as string[]).filter((t) => messageTargets.has(t as AutomodTarget));

      for (const t of ruleTargets) {
        const content = this.extractContentForTarget(message, t as AutomodTarget);
        if (!content) continue;

        const result = testPatterns(rule.patterns as Array<{ regex: string; flags: string; label: string }>, content, rule.matchMode as "any" | "all");

        if (result.matched && result.matchedPattern) {
          return {
            rule,
            matchedContent: result.matchedPattern.match,
            matchedPattern: result.matchedPattern.regex,
          };
        }
      }
    }

    return null;
  }

  /**
   * Evaluate a reaction against reaction-targeting rules.
   * A rule matches if its targets array includes REACTION_EMOJI.
   */
  evaluateReaction(reaction: MessageReaction | PartialMessageReaction, rules: RuleDoc[]): RuleMatch | null {
    const applicableRules = rules.filter((r) => r.enabled && (r.target as unknown as string[]).includes(AutomodTarget.REACTION_EMOJI)).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Build content string from reaction emoji
    const emoji = reaction.emoji;
    const content = emoji.id ? `${emoji.name}:${emoji.id}` : (emoji.name ?? "");

    for (const rule of applicableRules) {
      const result = testPatterns(rule.patterns as Array<{ regex: string; flags: string; label: string }>, content, rule.matchMode as "any" | "all");

      if (result.matched && result.matchedPattern) {
        return {
          rule,
          matchedContent: content,
          matchedPattern: result.matchedPattern.regex,
        };
      }
    }

    return null;
  }

  /**
   * Evaluate a member's username or nickname against targeting rules.
   * A rule matches if its targets array includes the relevant target type.
   */
  evaluateMember(member: GuildMember, rules: RuleDoc[], target: "username" | "nickname"): RuleMatch | null {
    const targetEnum = target === "username" ? AutomodTarget.USERNAME : AutomodTarget.NICKNAME;

    const applicableRules = rules.filter((r) => r.enabled && (r.target as unknown as string[]).includes(targetEnum)).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const content = target === "username" ? member.user.username : (member.nickname ?? "");

    if (!content) return null;

    for (const rule of applicableRules) {
      const result = testPatterns(rule.patterns as Array<{ regex: string; flags: string; label: string }>, content, rule.matchMode as "any" | "all");

      if (result.matched && result.matchedPattern) {
        return {
          rule,
          matchedContent: content,
          matchedPattern: result.matchedPattern.regex,
        };
      }
    }

    return null;
  }

  // ── Content Extraction ─────────────────────────────────

  private extractContentForTarget(message: Message, target: AutomodTarget): string | null {
    switch (target) {
      case AutomodTarget.MESSAGE_CONTENT:
        return message.content || null;

      case AutomodTarget.MESSAGE_EMOJI: {
        const emojis = extractEmoji(message.content);
        const parts: string[] = [...emojis.unicode, ...emojis.custom.map((e) => `${e.name}:${e.id}`)];
        return parts.length > 0 ? parts.join(" ") : null;
      }

      case AutomodTarget.STICKER: {
        if (message.stickers.size === 0) return null;
        const names = extractStickerNames(message.stickers.values());
        return names.join(" ");
      }

      case AutomodTarget.LINK: {
        const urls = extractUrls(message.content);
        return urls.length > 0 ? urls.join(" ") : null;
      }

      default:
        return null;
    }
  }
}
