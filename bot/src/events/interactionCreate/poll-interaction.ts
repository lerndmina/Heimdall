import {
  Client,
  Interaction,
  InteractionType,
  Message,
  MessageComponentInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import FetchEnvs from "../../utils/FetchEnvs";
import Database from "../../utils/data/database";
import PollsSchema, { PollsType } from "../../models/PollsSchema";
import { debugMsg, ThingGetter } from "../../utils/TinyUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import { debug } from "console";
import { redisClient } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import log from "../../utils/log";
const env = FetchEnvs();

// Poll update queuing system
interface UpdateTask {
  pollId: string;
  lastRequestTime: number;
  pendingCount: number;
  isProcessing: boolean;
}

const updateTasks = new Map<string, UpdateTask>();
const UPDATE_COOLDOWN = 2_000; // 2 seconds cooldown between updates
const MAX_WAIT_TIME = 10_000; // 10 seconds max wait time

/**
 * Generates a progress bar using Unicode block characters
 */
function generateProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;

  const fullBlock = "█";
  const emptyBlock = "░";

  return fullBlock.repeat(filled) + emptyBlock.repeat(empty);
}

/**
 * Calculates vote percentage for an option
 */
function calculatePercentage(votes: number, totalVotes: number): number {
  if (totalVotes === 0) return 0;
  return Math.round((votes / totalVotes) * 100);
}

/**
 * Central function for generating poll message content with progress bars
 * @param poll The poll data
 * @param client Discord client instance
 * @param isFinished Whether the poll has finished (affects formatting)
 */
export function generatePollMessage(
  poll: PollsType,
  client: Client<true>,
  isFinished: boolean = false
) {
  const totalVotes = poll.voterDetails ? poll.voterDetails.length : 0;

  if (isFinished) {
    // Final results formatting with longer progress bars
    const finalResults = poll.options
      .map((option: any, index: number) => {
        const percentage = calculatePercentage(option.votes, totalVotes);
        const progressBar = generateProgressBar(percentage, 15); // Longer bars for final results
        return `${index + 1}. **${option.name}**\n${progressBar} ${
          option.votes
        } votes (${percentage}%)`;
      })
      .join("\n\n");

    return BasicEmbed(
      client,
      `📊 ${poll.question}`,
      `**Poll Results**\n\n${finalResults}\n\n**Total Votes:** ${totalVotes}`,
      undefined,
      "#2F3136"
    );
  } else {
    // Active poll formatting with standard progress bars
    const optionsWithBars = poll.options
      .map((option: any, index: number) => {
        const percentage = calculatePercentage(option.votes, totalVotes);
        const progressBar = generateProgressBar(percentage);
        return `${index + 1}. \`${option.name}\` ${progressBar} ${option.votes} (${percentage}%)`;
      })
      .join("\n");

    const updatedDescriptionArray = [
      poll.embedDescriptionArray[0], // End time
      `Total Votes - ${totalVotes}`,
      poll.embedDescriptionArray[2] || "", // Description if any
      `\n${optionsWithBars}`,
      poll.embedDescriptionArray[4] || "\n**You can change your vote every 60 seconds**.", // Vote change info
    ];

    return BasicEmbed(client, poll.question, updatedDescriptionArray.join("\n"));
  }
}
export default async (interaction: StringSelectMenuInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.customId.startsWith("poll")) return;

  await initialReply(interaction, true);

  const db = new Database();
  const getter = new ThingGetter(client);

  const pollId = interaction.customId;
  const poll = (await db.findOne(PollsSchema, { pollId })) as PollsType;
  if (!poll)
    return interaction.editReply({
      content:
        "Poll not found. This poll is probably old enough to have been purged from my database.",
    });
  if (poll.hasFinished) return interaction.editReply({ content: "Poll has already finished." });

  const voteInt = Number.parseInt(interaction.values[0]);
  const userId = interaction.user.id;

  const END_OPTION = poll.options.length;

  if (
    voteInt === END_OPTION &&
    !env.OWNER_IDS.includes(interaction.user.id) &&
    interaction.user.id !== poll.creatorId
  )
    return interaction.editReply({
      content: "Only the poll creator can end the poll.",
    });

  if (voteInt === END_OPTION) {
    endPoll(client, poll.pollId, interaction.message, db, interaction);
    return true;
  }

  if (isNaN(voteInt) || voteInt < 0 || voteInt >= poll.options.length)
    return interaction.editReply({ content: "Invalid vote." });

  // Check for vote change cooldown
  const cooldownKey = `pollVote:${userId}:${pollId}`;
  const cooldownExists = await redisClient.exists(cooldownKey);

  if (cooldownExists) {
    const ttl = await redisClient.ttl(cooldownKey);
    return interaction.editReply({
      content: `Please wait ${ttl > 0 ? ttl : 60} seconds before changing your vote again.`,
    });
  }
  // Initialize voterDetails if it doesn't exist
  if (!poll.voterDetails || poll.voterDetails.length === 0) {
    poll.voterDetails = [] as any;
  }
  if (!poll.voters) poll.voters = [];

  // Check if user has already voted
  const existingVoteIndex = poll.voterDetails.findIndex((voter: any) => voter.userId === userId);
  let isVoteChange = false;
  if (existingVoteIndex !== -1) {
    // User is changing their vote
    const oldVoteIndex = poll.voterDetails[existingVoteIndex].optionIndex;

    // Update the vote counts
    poll.options[oldVoteIndex].votes--;
    poll.options[voteInt].votes++;

    // Update voter details
    (poll.voterDetails[existingVoteIndex] as any).optionIndex = voteInt;
    (poll.voterDetails[existingVoteIndex] as any).lastVoteTime = new Date();

    isVoteChange = true;
    log.debug(`User ${userId} changed vote from option ${oldVoteIndex} to ${voteInt}`);
  } else {
    // New vote
    (poll.voterDetails as any).push({
      userId,
      optionIndex: voteInt,
      lastVoteTime: new Date(),
    });

    if (!poll.voters.includes(userId)) {
      poll.voters.push(userId);
    }

    poll.options[voteInt].votes++;
    log.debug(`User ${userId} added new vote for option ${voteInt}`);
  }

  // Set cooldown for 60 seconds
  await redisClient.set(cooldownKey, "1", { EX: 60 });

  // Update the poll in database
  await db.findOneAndUpdate(PollsSchema, { pollId }, poll);

  // Queue the message update
  await queuePollUpdate(poll, interaction);

  const voteAction = isVoteChange ? "changed to" : "counted for";
  interaction.editReply({
    content: `Your vote has been ${voteAction} \`${poll.options[voteInt].name}\`!\n-# The poll display will update shortly.`,
  });

  return true;
};

/**
 * @deprecated Use generatePollMessage instead for consistent poll formatting
 * Legacy function kept for backwards compatibility
 */
export function getPollEmbed(
  interaction: Interaction,
  embedDescriptionArray: string[],
  question: string
) {
  return BasicEmbed(interaction.client, question, embedDescriptionArray.join("\n"));
}

/**
 * Queue a poll message update to prevent rate limiting
 */
async function queuePollUpdate(poll: PollsType, interaction: StringSelectMenuInteraction) {
  if (!poll.pollId) {
    log.error("Cannot queue update for poll with undefined ID");
    return;
  }

  const pollKey = `poll-${poll.pollId}`;
  let task = updateTasks.get(pollKey);
  const now = Date.now();

  if (!task) {
    task = {
      pollId: poll.pollId.toString(),
      lastRequestTime: now,
      pendingCount: 1,
      isProcessing: false,
    };
    updateTasks.set(pollKey, task);
    log.debug(`Created update queue for poll ${poll.pollId}`);
  } else {
    task.lastRequestTime = now;
    task.pendingCount++;
  }

  if (task.isProcessing) {
    return;
  }

  await processPollUpdate(poll, interaction);
}

/**
 * Process poll message updates with batching and cooldown
 */
async function processPollUpdate(poll: PollsType, interaction: StringSelectMenuInteraction) {
  if (!poll.pollId) {
    log.error("Cannot process update for poll with undefined ID");
    return;
  }

  const pollKey = `poll-${poll.pollId}`;
  let task = updateTasks.get(pollKey);

  if (!task) {
    log.error(`Update task not found for poll ${poll.pollId}`);
    return;
  }

  task.isProcessing = true;
  log.debug(
    `Starting update process for poll ${poll.pollId} with ${task.pendingCount} pending updates`
  );

  while (task.pendingCount > 0) {
    const now = Date.now();
    const timeSinceLastRequest = now - task.lastRequestTime;
    const shouldUpdate =
      task.pendingCount === 1 ||
      timeSinceLastRequest > UPDATE_COOLDOWN ||
      now - (task.lastRequestTime - timeSinceLastRequest) > MAX_WAIT_TIME;

    if (!shouldUpdate) {
      const waitTime = Math.min(UPDATE_COOLDOWN - timeSinceLastRequest, 1000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    log.debug(`Processing ${task.pendingCount} pending updates for poll ${poll.pollId}`);

    try {
      await updatePollMessage(poll, interaction);
      task.pendingCount = 0;
      log.debug(`Successfully updated poll ${poll.pollId}`);
    } catch (error) {
      log.error(`Error processing update for poll ${poll.pollId}:`, error);
      task.pendingCount = Math.max(0, task.pendingCount - 1);

      if (task.pendingCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  task.isProcessing = false;
}

/**
 * Update the poll message with progress bars and current vote counts
 */
async function updatePollMessage(poll: PollsType, interaction: StringSelectMenuInteraction) {
  try {
    const db = new Database();
    const latestPoll = await db.findOne(PollsSchema, { pollId: poll.pollId });

    if (!latestPoll || !latestPoll.voterDetails) {
      log.error(`Poll ${poll.pollId} not found in database or has no voter details`);
      return;
    }

    // Use the central function to generate the embed
    const embed = generatePollMessage(latestPoll, interaction.client);

    await editMessageWithRetry(interaction, embed);
  } catch (error) {
    log.error(`Error updating poll message:`, error);
    throw error;
  }
}

/**
 * Helper function to retry message edits with exponential backoff
 */
async function editMessageWithRetry(
  interaction: StringSelectMenuInteraction,
  embed: any,
  maxRetries: number = 10
) {
  let retries = 0;
  let success = false;

  while (retries < maxRetries && !success) {
    try {
      await interaction.message.edit({ embeds: [embed] });
      success = true;
      log.debug(
        `Successfully updated poll message after ${
          retries > 0 ? retries + " retries" : "first attempt"
        }`
      );
    } catch (error: any) {
      if (error.code === 10008) {
        log.error(`Message no longer exists (code 10008), cannot update`);
        break;
      } else if (error.code === 429) {
        retries++;
        const waitTime = Math.pow(2, retries) * 1000;
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

async function updateCount(poll: PollsType, interaction: StringSelectMenuInteraction) {
  // This function is now replaced by the queueing system
  // Keeping for backwards compatibility but functionality moved to queuePollUpdate
  await queuePollUpdate(poll, interaction);
}

export async function endPoll(
  client: Client<true>,
  pollId: String,
  message: Message,
  db: Database,
  interaction?: StringSelectMenuInteraction
) {
  const poll = await db.findOne(PollsSchema, { pollId });
  if (!poll || poll.hasFinished) return;

  poll.hasFinished = true;
  await db.findOneAndUpdate(PollsSchema, { pollId }, poll);

  if (interaction) interaction.editReply({ content: "Ending the poll." });

  // Use the central function to generate the final results embed
  const embed = generatePollMessage(poll, client, true);

  try {
    await message.edit({
      components: [],
      embeds: [embed],
      content: null,
    });
    log.info(`Poll ${pollId} ended successfully`);
  } catch (error) {
    log.error("Error editing poll message on end:", error);
    debugMsg("Error sending poll results or editing poll message.");
  }
}
