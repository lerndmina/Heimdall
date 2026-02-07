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
      // Dynamically import lib to avoid circular dep (lib may not be available yet via context)
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
 * If channel/message not found, removes persistData from DB.
 */
export async function beginPersistentLoop(client: Client, server: IMcServerStatus, _lib: unknown): Promise<void> {
  if (!server.persistData) return;

  const { channelId, messageId } = server.persistData;

  log.debug(`Starting persistent loop for ${server.serverName} (${server.serverIp}:${server.serverPort})`);

  // Resolve channel
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    log.error(`Channel ${channelId} not found — removing persist for ${server.serverName}`);
    await McServerStatus.findOneAndUpdate({ id: server.id }, { persistData: null });
    return;
  }

  // Resolve message
  const textChannel = channel as TextChannel;
  const message = await textChannel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    log.error(`Message ${messageId} not found in ${channelId} — removing persist for ${server.serverName}`);
    await McServerStatus.findOneAndUpdate({ id: server.id }, { persistData: null });
    return;
  }

  log.debug(`Persistent loop active: ${server.serverName} → #${textChannel.name}`);

  // Infinite loop
  while (true) {
    try {
      const pingData = await pingMcServer(server);
      const embedData = createStatusEmbed(pingData, server, client);
      await message.edit(embedData);

      const sleepMs = pingData.nextPingInSeconds * 1000;
      log.debug(`${server.serverName}: next ping in ${Math.round(sleepMs / 1000)}s`);
      await sleep(sleepMs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Persistent loop error for ${server.serverName}: ${msg} — retrying in 60s`);
      await sleep(60000);
    }
  }
}
