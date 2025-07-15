import { ActivityType, type ActivityOptions, type Client, PresenceStatusData } from "discord.js";
import type { CommandKit } from "commandkit";
import { redisClient } from "../../Bot";
import Database from "../../utils/data/database";
import Settings, { SettingsType } from "../../models/Settings";
import { ActivityEnum } from "../../commands/utilities/settings";
import { debugMsg, sleep, ThingGetter } from "../../utils/TinyUtils";
import TicTacToeSchema, { TicTacToeSchemaType } from "../../models/TicTacToeSchema";
import log from "../../utils/log";
import McServerStatus, { McServerStatusType } from "../../models/McServerStatus";
import { createStatusEmbed } from "../../commands/minecraft/mcstatus";
import { debug } from "console";
const db = new Database();

export default async (c: Client<true>, client: Client<true>, handler: CommandKit) => {
  const guilds = c.guilds.cache;
  const getter = new ThingGetter(c);
  for (const guildIdNameArr of guilds) {
    const id = guildIdNameArr[0];
    const guild = await getter.getGuild(id);
    if (!guild) {
      log.error("Guild not found " + id + " in checkservers");
      continue;
    }
    const mcServers = await McServerStatus.find({ guildId: id });
    if (!mcServers) {
      debugMsg("No mcServers found for " + id);
      continue;
    }
    for (const server of mcServers) {
      beginPersistantLoop(client, server, getter);
    }
  }
};

/**
 * This function pings a Minecraft server using the mcapi.us API
 * @param {McServerStatusType} server - The server to ping
 * @returns {Promise<McPingResponse>} - The response from the API
 * @throws {Error} - If the API request fails
 */
export async function pingMcServer(server: McServerStatusType): Promise<McPingResponse> {
  const API_URL_BASE = new URL("https://api.mcstatus.io/v2/status/java/");
  API_URL_BASE.pathname += `${server.serverIp}:${server.serverPort}`;
  const response = await fetch(API_URL_BASE.toString());
  let nextPingInSeconds: number = 0;
  if (response.headers.has("x-cache-hit")) {
    const cacheTimeRemaining = response.headers.get("x-cache-time-remaining");
    debugMsg({ message: "Cache hit", cacheTimeRemaining });
    nextPingInSeconds = parseInt(cacheTimeRemaining || "60000");
  }
  if (!response.ok) {
    throw new Error(
      `Failed to ping server ${server.serverName} at ${server.serverIp}:${server.serverPort}\nResponse: ${response.status} ${response.statusText}`
    );
  }
  let data = await response.json();
  if (data.error) {
    throw new Error(
      `Failed to ping server ${server.serverName} at ${server.serverIp}:${server.serverPort}\nResponse: ${data.error}`
    );
  }
  delete data.error;
  log.debug({ message: "Ping data", data });
  const updateInterval = server.persistData?.updateInterval || 30000;
  return {
    ...data,
    nextPingInSeconds: nextPingInSeconds + updateInterval / 1000,
  } as McPingResponse;
}

export async function beginPersistantLoop(
  client: Client<true>,
  server: McServerStatusType,
  getter: ThingGetter
) {
  if (!server.persistData) return;
  log.info({ message: "Starting persistant loop", serverName: server.serverName });
  const baseInterval = server.persistData.updateInterval;
  let interval = 0;
  const channelId = server.persistData.channelId;
  const messageId = server.persistData.messageId;

  const channel = await getter.getChannel(channelId);
  if (!channel) {
    log.error({
      message: "Channel not found removing persist",
      channelId,
      location: "beginPersistantLoop",
    });
    await db.findOneAndUpdate(
      McServerStatus,
      { guildId: server.guildId, serverName: server.serverName },
      { persistData: null }
    );
    return;
  }
  const message = await getter.getMessage(channel, messageId);
  if (!message) {
    log.error({
      message: "Message not found removing persist",
      messageId,
      location: "beginPersistantLoop",
    });
    await db.findOneAndUpdate(
      McServerStatus,
      { guildId: server.guildId, serverName: server.serverName },
      { persistData: null }
    );
    return;
  }

  if (!baseInterval) {
    log.error({ message: "Interval not found removing persist", location: "beginPersistantLoop" });
    await db.findOneAndUpdate(
      McServerStatus,
      { guildId: server.guildId, serverName: server.serverName },
      { persistData: null }
    );
    return;
  }

  while (true) {
    const pingData = await pingMcServer(server);
    const embedData = createStatusEmbed(pingData, server, client);
    await message.edit(embedData);
    debugMsg({ message: "Sleeping for", interval: pingData.nextPingInSeconds });
    await sleep(pingData.nextPingInSeconds * 1000); // Without the 1000 we get a weird race condition
  }
}

// Base interface with common properties
interface McPingResponseBase {
  online: boolean;
  host: string;
  port: number;
  ip_address: string;
  eula_blocked: boolean;
  retrieved_at: number;
  expires_at: number;
  srv_record: string | null;
  nextPingInSeconds: number;
}

// Interface for when server is online
interface McPingResponseOnline extends McPingResponseBase {
  online: true;
  version: {
    name_raw: string;
    name_clean: string;
    name_html: string;
    protocol: number;
  };
  players: {
    online: number;
    max: number;
    list: Array<{
      uuid: string;
      name_raw: string;
      name_clean: string;
      name_html: string;
    }>;
  };
  motd: {
    raw: string;
    clean: string;
    html: string;
  };
  icon: string;
  mods: any[];
  software: string | null;
  plugins: any[];
}

// Interface for when server is offline
interface McPingResponseOffline extends McPingResponseBase {
  online: false;
}

// Combined type that can be either online or offline response
export type McPingResponse = McPingResponseOnline | McPingResponseOffline;
