import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  MessageFlags,
} from "discord.js";
import FetchEnvs from "../../utils/FetchEnvs";
import Database from "../../utils/data/database";
import SuggestionModel, {
  SuggestionStatus,
  SuggestionsType,
  VotesModelType,
  VoteType,
} from "../../models/Suggestions";
import log from "../../utils/log";
import { ThingGetter } from "../../utils/TinyUtils";
import { getSuggestionButtons, getSuggestionEmbed } from "../../commands/suggestions/suggest";
import { initialReply } from "../../utils/initialReply";
import { redisClient } from "../../Bot";
import { createGitHubIssue } from "../../services/GithubConnection";

const env = FetchEnvs();
const db = new Database();

// Enhanced message edit queuing system
interface UpdateTask {
  suggestionId: string;
  lastRequestTime: number;
  pendingCount: number;
  isProcessing: boolean;
}

// Map to track update tasks for each suggestion
const updateTasks = new Map<string, UpdateTask>();
const UPDATE_COOLDOWN = 2_000; // 2 seconds cooldown between updates
const MAX_WAIT_TIME = 15_000; // Maximum time to wait before forcing an update (15 seconds)

/**
 *
 * @param {ButtonInteraction} interaction
 * @param {Client} client
 */
export default async (interaction: ButtonInteraction, client: Client) => {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (!interaction.customId || !interaction.customId.startsWith("suggest-")) return;
  if (!interaction.guild) return;

  // Extract the action type and suggestionId from the customId
  const [prefix, action, ...idParts] = interaction.customId.split("-");
  const suggestionId = idParts.join("-"); // Rejoin any parts of the ID that might contain hyphens

  const suggestion = await db.findOne(SuggestionModel, { id: suggestionId });
  if (!suggestion || !suggestion.id) {
    await interaction.reply({
      content:
        "This suggestion does not exist in the database or has an invalid ID.\nThis should never happen. Please contact the bot developer.",
    });
    return;
  }

  const getter = new ThingGetter(client);

  // Now you can use the action variable to determine what to do
  if (action === "upvote") {
    await handleVote(interaction, suggestion, VoteType.Upvote);
    return true;
  } else if (action === "downvote") {
    await handleVote(interaction, suggestion, VoteType.Downvote);
    return true;
  } else if (
    action === "manage" ||
    action === "approve" ||
    action === "deny" ||
    action === "cancel" ||
    action === "pending"
  ) {
    const member = await getter.getMember(interaction.guild!, interaction.user.id);
    if (!member) {
      await interaction.reply({
        content: "I was unable to check your permissions so you cannot manage this suggestion.",
      });
      return true;
    }
    if (!member.permissions.has("ManageMessages")) {
      await interaction.reply({
        content: "You do not have permission to manage this suggestion.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await handleManage(interaction, suggestion, action);
    return true;
  }
};

async function handleVote(
  interaction: ButtonInteraction,
  suggestion: SuggestionsType,
  voteType: VoteType
) {
  await initialReply(interaction, true);
  if (suggestion.id === undefined) {
    await interaction.editReply({
      content: "This suggestion has an invalid ID. Please contact the bot developer.",
    });
    return;
  }

  const userId = interaction.user.id;

  // Check for cooldown
  const cooldownKey = `suggestionVote:${userId}:${suggestion.id}`;
  const cooldownExists = await redisClient.exists(cooldownKey);

  if (cooldownExists) {
    const ttl = await redisClient.ttl(cooldownKey);
    await interaction.editReply({
      content: `Please wait ${ttl > 0 ? ttl : 60} seconds before voting on this suggestion again.`,
    });
    return;
  }

  try {
    // Find existing vote
    const existingVoteIndex = suggestion.votes?.findIndex((vote) => vote.userId === userId);

    // Check if the user is switching their vote or voting for the first time
    if (existingVoteIndex !== undefined && existingVoteIndex >= 0) {
      const existingVote = suggestion.votes?.[existingVoteIndex];

      // If the vote is the same, no need to update
      if (existingVote && existingVote.vote === voteType) {
        await interaction.editReply({
          content: `You've already voted ${voteType} for this suggestion.`,
        });
        return;
      }

      // If user already voted, update their vote using atomic operation
      await db.findOneAndUpdate(
        SuggestionModel,
        { id: suggestion.id, "votes.userId": userId },
        { $set: { "votes.$.vote": voteType } }
      );

      log.debug(`User ${userId} changed vote from ${existingVote?.vote} to ${voteType}`);
    } else {
      // If user hasn't voted, add new vote using atomic operation
      await db.findOneAndUpdate(
        SuggestionModel,
        { id: suggestion.id },
        { $push: { votes: { userId, vote: voteType } } }
      );

      log.debug(`User ${userId} added new ${voteType} vote`);
    }

    // Set cooldown for 60 seconds
    await redisClient.set(cooldownKey, "1", { EX: 60 });

    // Get current vote counts to include in the reply
    let replyMessage = `Your ${voteType} has been counted!\n-# Do not worry if the message does not update instantly I have carefully recorded your vote.`;

    // Check if there are pending updates
    const suggestionKey = `suggestion-${suggestion.id}`;
    const task = updateTasks.get(suggestionKey);
    if (task && task.pendingCount > 1) {
      replyMessage += `\n\nThere ${task.pendingCount > 1 ? "are" : "is"} currently ${
        task.pendingCount
      } pending update${task.pendingCount > 1 ? "s" : ""}.`;
      replyMessage += `\nThe buttons will update soon to reflect all votes.`;
    }

    // Acknowledge the vote immediately
    await interaction.editReply({ content: replyMessage });

    // Queue the message update
    await queueMessageUpdate(interaction, suggestion);
  } catch (error) {
    log.error(`Error processing vote:`, error);
    await interaction.editReply({
      content: "There was an error processing your vote. Please try again later.",
    });
  }
}

function calculateVoteCount(votes: VotesModelType[] | undefined, voteType: VoteType): number {
  if (!votes) return 0;
  if (votes.length === 0) return 0;
  return votes.filter((vote) => vote.vote === voteType).length;
}

// Enhanced message update queuing system
async function queueMessageUpdate(interaction: ButtonInteraction, suggestion: SuggestionsType) {
  if (suggestion.id === undefined) {
    log.error("Cannot queue update for suggestion with undefined ID");
    return;
  }

  const suggestionKey = `suggestion-${suggestion.id}`;

  // Get or create task
  let task = updateTasks.get(suggestionKey);
  const now = Date.now();

  if (!task) {
    task = {
      suggestionId: suggestion.id.toString(),
      lastRequestTime: now,
      pendingCount: 1,
      isProcessing: false,
    };
    updateTasks.set(suggestionKey, task);
    log.debug(`Created update queue for suggestion #${suggestion.id}`);
  } else {
    // Update existing task
    task.lastRequestTime = now;
    task.pendingCount++;
  }

  // If already processing, just increment the counter and return
  if (task.isProcessing) {
    return;
  }

  // Start processing the update
  await processMessageUpdate(interaction, suggestion);
}

async function processMessageUpdate(interaction: ButtonInteraction, suggestion: SuggestionsType) {
  if (suggestion.id === undefined) {
    log.error("Cannot process update for suggestion with undefined ID");
    return;
  }

  const suggestionKey = `suggestion-${suggestion.id}`;
  let task = updateTasks.get(suggestionKey);

  if (!task) {
    log.error(`Update task not found for suggestion #${suggestion.id}, this shouldn't happen`);
    return;
  }

  task.isProcessing = true;
  log.debug(
    `Starting update process for suggestion #${suggestion.id} with ${task.pendingCount} pending updates`
  );

  // Process updates until there are no more pending updates or until forced by time
  while (task.pendingCount > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - task.lastRequestTime;
    const shouldUpdate =
      task.pendingCount === 1 || // Only one request left
      timeSinceLastRequest > UPDATE_COOLDOWN || // Cooldown elapsed
      now - (task.lastRequestTime - timeSinceLastRequest) > MAX_WAIT_TIME; // Max wait time reached

    if (!shouldUpdate) {
      // Wait for either more votes to come in or the cooldown to elapse
      const waitTime = Math.min(UPDATE_COOLDOWN - timeSinceLastRequest, 1000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    // Time to process the update
    log.debug(`Processing ${task.pendingCount} pending updates for suggestion #${suggestion.id}`);

    try {
      await updateVoteMessage(interaction, suggestion);

      // Reset pending count after successful update
      task.pendingCount = 0;
      log.debug(`Successfully updated buttons for suggestion #${suggestion.id}`);
    } catch (error) {
      log.error(`Error processing update for suggestion #${suggestion.id}:`, error);

      // If we fail, reduce pending count but don't clear it
      // This ensures we'll try again but prevents an infinite loop
      task.pendingCount = Math.max(0, task.pendingCount - 1);

      // If we still have pending updates, wait before retrying
      if (task.pendingCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // Clean up
  task.isProcessing = false;
}

async function updateVoteMessage(interaction: ButtonInteraction, suggestion: SuggestionsType) {
  if (suggestion.id === undefined) {
    log.error("Cannot update message for suggestion with undefined ID");
    return;
  }

  try {
    // Get the latest suggestion data
    const latestSuggestion = await db.findOne(SuggestionModel, { id: suggestion.id });

    if (!latestSuggestion || !latestSuggestion.votes || latestSuggestion.id === undefined) {
      log.error(`Suggestion #${suggestion.id} not found in database or has no votes`);
      return;
    }

    const upvoteCount = calculateVoteCount(latestSuggestion.votes, VoteType.Upvote);
    const downvoteCount = calculateVoteCount(latestSuggestion.votes, VoteType.Downvote);
    log.debug(
      `Vote counts for suggestion #${suggestion.id}: ${upvoteCount} upvotes, ${downvoteCount} downvotes`
    );

    const row = getSuggestionButtons(upvoteCount, downvoteCount, suggestion);

    // Edit the message to update the buttons with exponential backoff
    await editMessageWithRetry(interaction, row);
  } catch (error) {
    log.error(`Error updating message for suggestion #${suggestion.id}:`, error);
    throw error;
  }
}

// Helper function to retry edits with exponential backoff
async function editMessageWithRetry(
  interaction: ButtonInteraction,
  row: any,
  maxRetries: number = 10
) {
  let retries = 0;
  let success = false;

  while (retries < maxRetries && !success) {
    try {
      await interaction.message.edit({ components: [row] });
      success = true;
      log.debug(
        `Successfully updated message after ${retries > 0 ? retries + " retries" : "first attempt"}`
      );
    } catch (error: any) {
      if (error.code === 10008) {
        // Unknown message error
        log.error(`Message no longer exists (code 10008), cannot update`);
        break;
      } else if (error.code === 429) {
        // Rate limited
        retries++;
        const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
        log.warn(`Rate limited, retrying in ${waitTime}ms (retry ${retries}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        log.error(`Unexpected error editing message:`, error);
        break;
      }
    }
  }

  return success;
}

async function handleManage(
  interaction: ButtonInteraction,
  suggestion: SuggestionsType,
  action: string
) {
  if (action === "manage") {
    await initialReply(interaction, true);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`suggest-approve-${suggestion.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`suggest-deny-${suggestion.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`suggest-pending-${suggestion.id}`)
        .setLabel("Pending")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`suggest-cancel-${suggestion.id}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      content: "Please select an action:",
      components: [row],
    });
  } else if (action === "cancel") {
    await interaction.update({
      content: "Action cancelled.",
      components: [],
    });
  } else if (action === "approve") {
    await approveOrDenySuggestion(interaction, suggestion, SuggestionStatus.Approved);
    return true;
  } else if (action === "deny") {
    await approveOrDenySuggestion(interaction, suggestion, SuggestionStatus.Denied);
    return true;
  } else if (action === "pending") {
    await approveOrDenySuggestion(interaction, suggestion, SuggestionStatus.Pending);
    return true;
  } else {
    await interaction.reply({
      content: "Invalid action. Please try again.",
      ephemeral: true,
    });
    return true;
  }

  async function approveOrDenySuggestion(
    interaction: ButtonInteraction,
    suggestion: SuggestionsType,
    status: SuggestionStatus
  ) {
    if (suggestion.id === undefined) {
      log.error("Cannot approve/deny suggestion with undefined ID");
      return;
    }

    const updatedSuggestion = await db.findOneAndUpdate(
      SuggestionModel,
      { id: suggestion.id },
      { status }
    );
    if (!updatedSuggestion) {
      log.error(`Failed to update suggestion #${suggestion.id} status to ${status}`);
      await interaction.editReply({
        content: "Failed to update suggestion status. Please try again later.",
      });
      return;
    }
    interaction.update({
      content: `Suggestion ${status}!`,
      components: [],
    });

    const getter = new ThingGetter(interaction.client);
    const message = await getter.getMessageFromUrl(new URL(updatedSuggestion.messageLink));
    if (!message) {
      log.error("Message not found in channel, cannot update suggestion message.");
      return;
    }
    const row = getSuggestionButtons(
      calculateVoteCount(updatedSuggestion.votes!, VoteType.Upvote),
      calculateVoteCount(updatedSuggestion.votes!, VoteType.Downvote),
      updatedSuggestion
    );

    const embed = getSuggestionEmbed(interaction, updatedSuggestion);

    let response: any = null;
    if (status === SuggestionStatus.Approved) {
      const suggestionUser = await getter.getUser(suggestion.userId);
      response = await createGitHubIssue(
        suggestion.title,
        `**Suggestion:**\n${suggestion.suggestion}\n\n**Reason:**\n ${suggestion.reason}\n\n**Suggested By:**\n ${suggestionUser.displayName} (${suggestionUser.id})`
      );
    }

    await message.edit({
      embeds: [embed],
      components: [row],
      content: "",
    });
    log.debug(`Suggestion #${suggestion.id} ${status === "approved" ? "approved" : "denied"}`);
  }
}
