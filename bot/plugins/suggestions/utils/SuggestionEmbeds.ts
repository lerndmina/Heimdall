/**
 * Suggestion Embeds Utility
 * Centralized embed builders for the suggestion system
 */

import { ActionRowBuilder, ButtonStyle, type ColorResolvable } from "discord.js";
import type { HeimdallButtonBuilder } from "../../lib/utils/components/HeimdallButtonBuilder.js";
import type { HeimdallEmbedBuilder } from "../../lib/utils/components/HeimdallEmbedBuilder.js";
import type { ISuggestion } from "../models/Suggestion.js";
import { SuggestionStatus, SuggestionHelper } from "../models/Suggestion.js";
import type { LibAPI } from "../../lib/index.js";

/** Button handler IDs for suggestions */
export enum SuggestionButtonIds {
  UPVOTE = "suggestion.upvote",
  DOWNVOTE = "suggestion.downvote",
  MANAGE = "suggestion.manage",
}

/** Management action button IDs */
export enum SuggestionManagementButtonIds {
  APPROVE = "suggestion.approve",
  DENY = "suggestion.deny",
  PENDING = "suggestion.pending",
  CANCEL = "suggestion.cancel",
}

/** Create a suggestion embed for display */
export function createSuggestionEmbed(lib: LibAPI, suggestion: ISuggestion): HeimdallEmbedBuilder {
  const { upvotes, downvotes } = SuggestionHelper.getVoteCounts(suggestion);

  let color: ColorResolvable;
  let emoji: string;

  switch (suggestion.status) {
    case SuggestionStatus.Approved:
      color = "Green";
      emoji = "✅";
      break;
    case SuggestionStatus.Denied:
      color = "Red";
      emoji = "❌";
      break;
    default:
      color = "Blue";
      emoji = "⏳";
  }

  const embed = lib
    .createEmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${suggestion.title}`)
    .setDescription(`**ID:** \`${suggestion.id}\``)
    .addFields(
      { name: "Suggestion", value: suggestion.suggestion, inline: false },
      { name: "Reason", value: suggestion.reason, inline: false },
      { name: "Submitted by", value: `<@${suggestion.userId}>`, inline: true },
      { name: "Status", value: suggestion.status, inline: true },
    )
    .setTimestamp(suggestion.createdAt)
    .setFooter({ text: `Mode: ${suggestion.mode} | 👍 ${upvotes} 👎 ${downvotes}` });

  if (suggestion.status !== SuggestionStatus.Pending && suggestion.managedBy) {
    embed.addFields({
      name: suggestion.status === SuggestionStatus.Approved ? "Approved by" : "Denied by",
      value: `<@${suggestion.managedBy}>`,
      inline: true,
    });
  }

  return embed;
}

/** Create voting and management buttons for a suggestion */
export function createSuggestionButtons(lib: LibAPI, suggestion: ISuggestion, upvotes: number, downvotes: number): ActionRowBuilder<HeimdallButtonBuilder> {
  const upvoteButton = lib
    .createButtonBuilderPersistent(SuggestionButtonIds.UPVOTE, {
      suggestionId: suggestion.id,
      action: "upvote",
    })
    .setLabel(`Upvote (${upvotes})`)
    .setStyle(ButtonStyle.Success)
    .setDisabled(suggestion.status !== SuggestionStatus.Pending)
    .setEmoji("👍");

  const downvoteButton = lib
    .createButtonBuilderPersistent(SuggestionButtonIds.DOWNVOTE, {
      suggestionId: suggestion.id,
      action: "downvote",
    })
    .setLabel(`Downvote (${downvotes})`)
    .setStyle(ButtonStyle.Danger)
    .setDisabled(suggestion.status !== SuggestionStatus.Pending)
    .setEmoji("👎");

  const manageButton = lib
    .createButtonBuilderPersistent(SuggestionButtonIds.MANAGE, {
      suggestionId: suggestion.id,
      action: "menu",
    })
    .setLabel("Manage")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("⚙️");

  return new ActionRowBuilder<HeimdallButtonBuilder>().addComponents(upvoteButton, downvoteButton, manageButton);
}

/** Create management action buttons (approve/deny/pending/cancel) */
export function createManagementButtons(lib: LibAPI, suggestionId: string): ActionRowBuilder<HeimdallButtonBuilder> {
  const approveButton = lib
    .createButtonBuilderPersistent(SuggestionManagementButtonIds.APPROVE, {
      suggestionId,
      action: "approve",
    })
    .setLabel("Approve")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  const denyButton = lib
    .createButtonBuilderPersistent(SuggestionManagementButtonIds.DENY, {
      suggestionId,
      action: "deny",
    })
    .setLabel("Deny")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("❌");

  const pendingButton = lib
    .createButtonBuilderPersistent(SuggestionManagementButtonIds.PENDING, {
      suggestionId,
      action: "pending",
    })
    .setLabel("Reset to Pending")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("⏳");

  const cancelButton = lib
    .createButtonBuilderPersistent(SuggestionManagementButtonIds.CANCEL, {
      suggestionId,
      action: "cancel",
    })
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("↩️");

  return new ActionRowBuilder<HeimdallButtonBuilder>().addComponents(approveButton, denyButton, pendingButton, cancelButton);
}

/** Create a suggestion list embed (for viewing multiple suggestions) */
export function createSuggestionListEmbed(
  lib: LibAPI,
  suggestions: ISuggestion[],
  page: number,
  totalPages: number,
  filter?: { status?: SuggestionStatus; mode?: "embed" | "forum" },
): HeimdallEmbedBuilder {
  const embed = lib
    .createEmbedBuilder()
    .setColor("Blue")
    .setTitle("📝 Suggestions List")
    .setTimestamp()
    .setFooter({ text: `Page ${page}/${totalPages}` });

  if (filter) {
    const parts: string[] = [];
    if (filter.status) parts.push(`Status: ${filter.status}`);
    if (filter.mode) parts.push(`Mode: ${filter.mode}`);
    if (parts.length > 0) embed.setDescription(`**Filters:** ${parts.join(" | ")}`);
  }

  if (suggestions.length === 0) {
    embed.addFields({ name: "No suggestions found", value: "No suggestions match your criteria." });
    return embed;
  }

  for (const suggestion of suggestions) {
    const { upvotes, downvotes } = SuggestionHelper.getVoteCounts(suggestion);
    const netVotes = upvotes - downvotes;

    let statusEmoji = "⏳";
    if (suggestion.status === SuggestionStatus.Approved) statusEmoji = "✅";
    if (suggestion.status === SuggestionStatus.Denied) statusEmoji = "❌";

    embed.addFields({
      name: `${statusEmoji} ${suggestion.title}`,
      value: `ID: \`${suggestion.id}\` | Votes: 👍${upvotes} 👎${downvotes} (${netVotes > 0 ? "+" : ""}${netVotes}) | By: <@${suggestion.userId}>`,
      inline: false,
    });
  }

  return embed;
}
