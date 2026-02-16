/**
 * On ready — start persistent mcstatus polling loops
 *
 * Finds all McServerStatus docs with persistData and starts
 * an infinite update loop for each one.
 */

import { Events, type Client, type TextChannel, ChannelType } from "discord.js";
import McServerStatus, { type IMcServerStatus } from "../../models/McServerStatus.js";
import { pingMcServer, createStatusEmbed } from "../../utils/mcstatus-utils.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("minecraft:checkservers");

/** Max sleep between pings — 5 minutes. Prevents runaway sleep from bad API data. */
const MAX_SLEEP_MS = 5 * 60 * 1000;

/** How many times to retry channel/message fetch before giving up on startup */
const STARTUP_RETRIES = 3;

/** Delay between startup retries (10 seconds) */
const STARTUP_RETRY_DELAY = 10_000;

export const event = Events.ClientReady;
export const once = true;
export const pluginName = "minecraft";

export async function execute(client: Client<true>): Promise<void> {
  log.debug("Starting checkservers — looking for persistent mcstatus servers");

  const servers = await McServerStatus.find({ persistData: { $ne: null } }).lean();

  let started = 0;
  for (const server of servers) {
    if (server.persistData) {
      started++;
      beginPersistentLoop(client, server, null);
    }
  }

  log.debug(`Checkservers complete — started ${started} persistent loops out of ${servers.length} servers`);
}

/**
 * Sleep utility for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a persistent update loop for a server status embed.
 * Runs forever — pings, edits embed, sleeps. On error retries after 60s.
 * If channel/message permanently gone after retries, removes persistData from DB.
 */
export async function beginPersistentLoop(client: Client, server: IMcServerStatus, _lib: unknown): Promise<void> {
  if (!server.persistData) return;

  const { channelId, messageId } = server.persistData;

  log.debug(`Starting persistent loop for ${server.serverName} (${server.serverIp}:${server.serverPort})`);

  // Resolve channel with retries — Discord API may be slow right after bot startup
  let channel: ReturnType<typeof client.channels.fetch> extends Promise<infer T> ? T : never = null;
  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt++) {
    channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased() && "send" in channel) break;
    if (attempt < STARTUP_RETRIES) {
      log.warn(`Channel ${channelId} not found for ${server.serverName} — retry ${attempt}/${STARTUP_RETRIES} in ${STARTUP_RETRY_DELAY / 1000}s`);
      await sleep(STARTUP_RETRY_DELAY);
    }
  }

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    log.error(`Channel ${channelId} permanently not found — removing persist for ${server.serverName}`);
    await McServerStatus.findOneAndUpdate({ id: server.id }, { persistData: null });
    return;
  }

  const textChannel = channel as TextChannel;

  // Resolve message with retries
  let message = await textChannel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt++) {
      await sleep(STARTUP_RETRY_DELAY);
      message = await textChannel.messages.fetch(messageId).catch(() => null);
      if (message) break;
      log.warn(`Message ${messageId} not found in ${channelId} for ${server.serverName} — retry ${attempt}/${STARTUP_RETRIES}`);
    }
  }

  if (!message) {
    log.error(`Message ${messageId} permanently not found in ${channelId} — removing persist for ${server.serverName}`);
    await McServerStatus.findOneAndUpdate({ id: server.id }, { persistData: null });
    return;
  }

  log.debug(`Persistent loop active: ${server.serverName} → #${textChannel.name}`);

  // Track consecutive failures so we can escalate if something is permanently broken
  let consecutiveFailures = 0;

  // Infinite loop
  while (true) {
    try {
      // Re-read server from DB each iteration to pick up config changes (e.g. updateInterval)
      const freshServer = await McServerStatus.findOne({ id: server.id }).lean();
      if (!freshServer || !freshServer.persistData) {
        log.info(`Server ${server.serverName} no longer has persistData — stopping loop`);
        return;
      }

      const pingData = await pingMcServer(freshServer);
      const embedData = createStatusEmbed(pingData, freshServer, client);

      // Re-fetch message in case reference went stale (e.g. after reconnect)
      try {
        const freshMessage = await textChannel.messages.fetch(messageId);
        await freshMessage.edit(embedData);
      } catch (editError) {
        // If message was deleted, stop the loop and clean up
        const errMsg = editError instanceof Error ? editError.message : String(editError);
        if (errMsg.includes("Unknown Message")) {
          log.error(`Message ${messageId} was deleted — removing persist for ${server.serverName}`);
          await McServerStatus.findOneAndUpdate({ id: server.id }, { persistData: null });
          return;
        }
        throw editError; // Re-throw other errors to be caught by outer catch
      }

      // Save ping results to DB so the dashboard can display current data
      await McServerStatus.findOneAndUpdate({ id: server.id }, { lastPingData: pingData, lastPingTime: new Date() });

      consecutiveFailures = 0; // Reset on success

      // Clamp sleep duration to prevent runaway waits
      const rawSleepMs = pingData.nextPingInSeconds * 1000;
      const sleepMs = Math.min(Math.max(rawSleepMs || 61_000, 30_000), MAX_SLEEP_MS);
      log.debug(`${server.serverName}: next ping in ${Math.round(sleepMs / 1000)}s`);
      await sleep(sleepMs);
    } catch (error) {
      consecutiveFailures++;
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Persistent loop error for ${server.serverName} (failure #${consecutiveFailures}): ${msg}`);

      // After 30 consecutive failures (~30 minutes), back off to 5 min intervals
      const backoffMs = consecutiveFailures >= 30 ? MAX_SLEEP_MS : 60_000;
      await sleep(backoffMs);
    }
  }
}
