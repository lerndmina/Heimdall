import { ChannelType, Message, type Client } from "discord.js";
import type { CommandHandler } from "@heimdall/command-handler";
import PollsSchema, { PollsType } from "../../models/PollsSchema";
import Database from "../../utils/data/database";
import { ThingGetter, debugMsg, sleep } from "../../utils/TinyUtils";
import { endPoll } from "../interactionCreate/poll-interaction";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
/**
 *
 * @param {Client} c
 * @param {Client} client
 */

const env = FetchEnvs();

export default async (c: Client<true>, client: Client<true>, handler: CommandHandler) => {
  await sleep(2000); // Increase delay to ensure client is fully ready

  const db = new Database();
  db.cleanCache(db.getCacheKeys(PollsSchema, `*`));

  // Ensure client is ready before creating ThingGetter
  if (!client.isReady()) {
    log.error("Client is not ready, skipping checkpolls");
    return;
  }

  const getter = new ThingGetter(client);
  const polls = await PollsSchema.find();
  if (!polls) return log.info("No polls found in the database.");

  for (const poll of polls) {
    if (!poll) continue;
    if (poll.hasFinished) {
      purgeStalePoll(poll, db, client);
      continue;
    }
    if (new Date(poll.endsAt).getTime() < Date.now()) {
      poll.hasFinished = true;
      await db.findOneAndUpdate(PollsSchema, { pollId: poll.pollId }, poll);
    } else {
      try {
        await waitForPollEnd(poll, db, client, getter);
      } catch (error) {
        log.error(`Failed to setup poll end watcher for ${poll.pollId}:`, error);
      }
    }
  }
  return;
};

async function purgeStalePoll(poll: PollsType, db: Database, client: Client<true>) {
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const pollEndTime = new Date(poll.endsAt).getTime();
  if (pollEndTime + ONE_DAY < Date.now()) {
    log.info(`Purging stale poll: ${poll.question} - ${poll.pollId}`);
    db.findOneAndDelete(PollsSchema, { pollId: poll.pollId });
  }
}

export async function waitForPollEnd(
  poll: PollsType,
  db: Database,
  client: Client<true>,
  getter: ThingGetter
) {
  const pollEndTime = new Date(poll.endsAt).getTime();

  log.info(
    // prettier-ignore
    `Starting timeout for poll: "${poll.question.substring(0, 20)}..." -> "pollId:${poll.pollId}"`
  );

  try {
    const channel = await getter.getChannel(poll.channelId);
    if (!channel || channel.isTextBased() === false) {
      log.error(`Channel not found or not text-based: ${poll.channelId}, unable to end poll.`);
      return;
    }

    let message: Message;
    try {
      message = await channel.messages.fetch(poll.messageId);
    } catch (error) {
      log.error(`Message not found: ${poll.messageId}, unable to end poll.`);
      return;
    }

    await new Promise((resolve) => {
      setTimeout(async () => {
        endPoll(client, poll.pollId, message, db);
        resolve(true);
      }, pollEndTime - Date.now());
    });
  } catch (error) {
    log.error(`Error in waitForPollEnd for poll ${poll.pollId}:`, error);
  }
}
