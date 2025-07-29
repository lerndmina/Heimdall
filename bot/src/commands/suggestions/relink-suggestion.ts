/**
 * Context Menu Command: Relink Suggestion
 *
 * This command allows administrators to relink broken suggestions to their Discord messages.
 * It's designed to fix race condition issues where suggestion messages were created with
 * temporary button IDs but never updated with the real database IDs.
 *
 * The command automatically extracts the suggestion title and submitter from the message embed,
 * then searches the database for matching suggestions. If found, it updates the message link
 * and refreshes the buttons with the correct IDs.
 *
 * Usage:
 * 1. Right-click on a suggestion message that has broken buttons
 * 2. Select "Relink Suggestion" from the context menu
 * 3. The command automatically searches by title and user
 * 4. If multiple matches found, it displays them with UUIDs for manual selection
 * 5. If found, the message is updated with working buttons
 *
 * Features:
 * - Automatic title/user extraction from embed
 * - Smart database search with partial title matching
 * - Multiple match handling with UUID display
 * - Full button and embed refresh
 * - Comprehensive error handling and logging
 *
 * Requirements:
 * - User must have "Manage Messages" permission
 * - Target message must have suggestion-like buttons (customId starts with "suggest-")
 * - Message must have a valid suggestion embed with title and "Submitted by" field
 */

import type {
  LegacyContextMenuCommandDataOnly,
  LegacyContextMenuCommandProps,
  LegacyCommandOptions,
} from "@heimdall/command-handler";
import {
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  MessageFlags,
  MessageContextMenuCommandInteraction,
  Message,
} from "discord.js";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import SuggestionModel, { SuggestionsType } from "../../models/Suggestions";
import { getSuggestionButtons, getSuggestionEmbed } from "./suggest";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import { VoteType } from "../../models/Suggestions";

const db = new Database();

export const data: LegacyContextMenuCommandDataOnly = {
  name: "Relink Suggestion",
  type: ApplicationCommandType.Message,
};

export async function run({ interaction, client, handler }: LegacyContextMenuCommandProps) {
  // Type guard to ensure this is a message context menu
  if (!interaction.isMessageContextMenuCommand()) {
    return;
  }

  // Check if user has manage messages permission
  if (!interaction.memberPermissions?.has("ManageMessages")) {
    return interaction.reply({
      content: "❌ You need the `Manage Messages` permission to use this command.",
      ephemeral: true,
    });
  }

  const targetMessage = interaction.targetMessage;

  // Check if this looks like a suggestion message (has suggestion buttons)
  const hasSuggestionButtons = targetMessage.components.some(
    (row) =>
      "components" in row &&
      row.components.some(
        (component) => "customId" in component && component.customId?.startsWith("suggest-")
      )
  );

  if (!hasSuggestionButtons) {
    return interaction.reply({
      content: "❌ This doesn't appear to be a suggestion message (no suggestion buttons found).",
      ephemeral: true,
    });
  }

  // Extract suggestion info from the embed
  const embed = targetMessage.embeds[0];
  if (!embed) {
    return interaction.reply({
      content: "❌ This message doesn't have an embed. Cannot extract suggestion information.",
      ephemeral: true,
    });
  }

  // Extract title (remove emoji prefix like "💡 - ")
  let suggestionTitle = embed.title || "";
  const titleMatch = suggestionTitle.match(/^[\s\S]*?\s-\s(.+)$/);
  if (titleMatch) {
    suggestionTitle = titleMatch[1].trim();
  }

  // Extract user ID from "Submitted by" field
  let userId = "";
  const submittedByField = embed.fields?.find((field) => field.name === "Submitted by");
  if (submittedByField) {
    const userMentionMatch = submittedByField.value.match(/<@(\d+)>/);
    if (userMentionMatch) {
      userId = userMentionMatch[1];
    }
  }

  log.debug("Extracted suggestion info from message", {
    suggestionTitle,
    userId,
    embedTitle: embed.title,
    fieldsCount: embed.fields?.length,
  });

  // Try to find the suggestion using title and user
  try {
    await interaction.reply({
      content: "🔍 Searching for suggestion in database...",
      ephemeral: true,
    });

    const searchResult = await findSuggestionByTitleAndUser(
      suggestionTitle,
      userId,
      interaction.guildId!
    );

    if (searchResult.found && searchResult.suggestion) {
      // Found exactly one match, proceed with relinking
      await relinkSuggestion(interaction, searchResult.suggestion, targetMessage, client);
    } else if (searchResult.multipleFound) {
      // Multiple matches found, show them for manual selection
      let message = `Found ${searchResult.suggestions!.length} matching suggestions:\n\n`;
      searchResult.suggestions!.forEach((s, i) => {
        message += `${i + 1}. **${s.title}**\n   ID: \`${s.id}\`\n   Status: ${s.status}\n\n`;
      });
      message += "Please use the exact UUID of the correct suggestion.";

      await interaction.editReply({
        content: message.substring(0, 2000), // Discord limit
      });
    } else {
      // No matches found
      await interaction.editReply({
        content: `❌ Could not find suggestion with title "${suggestionTitle}" from user <@${userId}>.\n\nPlease check the suggestion details and try again.`,
      });
    }
  } catch (error) {
    log.error("Error searching for suggestion:", error);
    await interaction.editReply({
      content: "❌ Error searching for suggestion. Please provide the exact UUID manually.",
    });
  }
}

// Helper function to search for suggestions by title and user
async function findSuggestionByTitleAndUser(title: string, userId: string, guildId: string) {
  try {
    // Search for suggestions with similar title and matching user
    const suggestions = await SuggestionModel.find({
      guildId: guildId,
      userId: userId,
      title: { $regex: title, $options: "i" }, // Case-insensitive partial match
    }).limit(5); // Limit to prevent overwhelming results

    if (suggestions.length === 0) {
      return { found: false, multipleFound: false, suggestions: [] };
    } else if (suggestions.length === 1) {
      return { found: true, multipleFound: false, suggestion: suggestions[0], suggestions };
    } else {
      return { found: false, multipleFound: true, suggestions };
    }
  } catch (error) {
    log.error("Error searching suggestions:", error);
    return { found: false, multipleFound: false, suggestions: [] };
  }
}

// Helper function to relink a suggestion
async function relinkSuggestion(
  interaction: MessageContextMenuCommandInteraction,
  suggestion: any,
  targetMessage: Message,
  client: any
) {
  try {
    log.debug("Relinking suggestion", {
      suggestionId: suggestion.id,
      messageId: targetMessage.id,
      messageUrl: targetMessage.url,
    });

    // Update the suggestion's message link
    const updatedSuggestion = await db.findOneAndUpdate(
      SuggestionModel,
      { id: suggestion.id },
      { messageLink: targetMessage.url },
      { upsert: false, new: true }
    );

    if (!updatedSuggestion) {
      return interaction.editReply({
        content: "❌ Failed to update suggestion in database.",
      });
    }

    // Calculate current vote counts
    const upvoteCount =
      updatedSuggestion.votes?.filter((vote) => vote.vote === VoteType.Upvote).length || 0;
    const downvoteCount =
      updatedSuggestion.votes?.filter((vote) => vote.vote === VoteType.Downvote).length || 0;

    // Update the message with correct buttons and embed
    const updatedEmbed = getSuggestionEmbed(interaction, updatedSuggestion as SuggestionsType);
    const updatedButtons = getSuggestionButtons(
      upvoteCount,
      downvoteCount,
      updatedSuggestion as SuggestionsType
    );

    const { error: updateError } = await tryCatch(
      targetMessage.edit({
        embeds: [updatedEmbed],
        components: [updatedButtons],
      })
    );

    if (updateError) {
      log.error("Failed to update message with new buttons", { error: updateError });
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "⚠️ Partial Success",
            `Database updated successfully but failed to update message buttons.\n\n**Suggestion ID:** \`${suggestion.id}\`\n**Message Link:** ${targetMessage.url}`,
            undefined,
            "Yellow"
          ),
        ],
      });
    }

    log.info("Successfully relinked suggestion", {
      suggestionId: suggestion.id,
      messageId: targetMessage.id,
      messageUrl: targetMessage.url,
    });

    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Suggestion Relinked",
          `Successfully relinked suggestion to this message!\n\n**Suggestion ID:** \`${suggestion.id}\`\n**Title:** ${updatedSuggestion.title}\n**Message Link:** ${targetMessage.url}\n**Vote Counts:** 👍 ${upvoteCount} | 👎 ${downvoteCount}`,
          undefined,
          "Green"
        ),
      ],
    });
  } catch (error) {
    log.error("Error relinking suggestion:", error);
    await interaction.editReply({
      content: "❌ An error occurred while relinking the suggestion. Please try again.",
    });
  }
}

export const options: LegacyCommandOptions = {
  devOnly: false,
  userPermissions: ["ManageMessages"],
  botPermissions: ["SendMessages", "EmbedLinks"],
  deleted: false,
};
