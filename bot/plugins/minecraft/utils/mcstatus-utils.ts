/**
 * MC Server Status utilities — ping servers via mcstatus.io API
 * and build status embeds with favicons.
 */

import type { Client } from "discord.js";
import type { IMcServerStatus, IMessagePersist } from "../models/McServerStatus.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:mcstatus-utils");

// ── Types ──────────────────────────────────────────────────────

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
  mods: unknown[];
  software: string | null;
  plugins: unknown[];
}

interface McPingResponseOffline extends McPingResponseBase {
  online: false;
}

export type McPingResponse = McPingResponseOnline | McPingResponseOffline;

// ── Ping ───────────────────────────────────────────────────────

/**
 * Ping a Minecraft server via the mcstatus.io API.
 * Respects API cache headers to determine next ping interval.
 */
export async function pingMcServer(server: { serverIp: string; serverPort: number; serverName: string; persistData?: IMessagePersist | null }): Promise<McPingResponse> {
  const url = `https://api.mcstatus.io/v2/status/java/${server.serverIp}:${server.serverPort}`;

  const response = await fetch(url);
  let nextPingInSeconds = 0;

  if (response.headers.has("x-cache-hit")) {
    const cacheTimeRemaining = response.headers.get("x-cache-time-remaining");
    nextPingInSeconds = parseInt(cacheTimeRemaining || "60", 10);
  }

  if (!response.ok) {
    throw new Error(`Failed to ping server ${server.serverName} at ${server.serverIp}:${server.serverPort} — ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (data.error) {
    throw new Error(`Failed to ping server ${server.serverName}: ${data.error}`);
  }

  const updateInterval = server.persistData?.updateInterval || 61000;

  return {
    ...data,
    nextPingInSeconds: nextPingInSeconds + updateInterval / 1000,
  } as McPingResponse;
}

// ── Embed ──────────────────────────────────────────────────────

/**
 * Build a status embed for a Minecraft server.
 * Includes favicon as attachment, player count, version, MOTD.
 */
export function createStatusEmbed(
  data: McPingResponse,
  dbData: { serverName: string; serverIp: string; serverPort: number; persistData?: IMessagePersist | null },
  client: Client,
): { embeds: [import("discord.js").EmbedBuilder]; files: Array<{ attachment: Buffer; name: string }>; content: string } {
  // We import EmbedBuilder here to avoid circular deps with lib plugin
  const { EmbedBuilder } = require("discord.js");

  let faviconAttachment: { attachment: Buffer; name: string } | undefined;
  if (data.online && data.icon?.startsWith("data:image/png;base64,")) {
    try {
      const base64Data = data.icon.replace(/^data:image\/png;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      faviconAttachment = { attachment: imageBuffer, name: "server-icon.png" };
    } catch (error) {
      log.error("Error converting favicon to attachment:", error);
    }
  }

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    { name: "Server Name", value: dbData.serverName, inline: true },
    { name: "Server IP", value: dbData.serverIp, inline: true },
    { name: "Server Port", value: dbData.serverPort.toString(), inline: true },
    { name: "Status", value: data.online ? "Online" : "Offline", inline: true },
  ];

  let isMaintenance = false;

  if (data.online) {
    fields.push({ name: "Players", value: `${data.players.online}/${data.players.max}`, inline: true });
    fields.push({ name: "Version", value: data.version.name_clean, inline: true });
    if (data.motd.clean.toLowerCase().includes("maintenance")) {
      isMaintenance = true;
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const nextUpdate = data.nextPingInSeconds + nowSeconds;

  if (dbData.persistData) {
    fields.push({ name: "Next Update", value: `<t:${Math.floor(nextUpdate)}:R>`, inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Server Status for ${dbData.serverName}`)
    .setColor(data.online ? (isMaintenance ? 0xff8c00 : 0x00ff00) : 0xff0000)
    .setDescription(data.online ? data.motd.clean : "Server is offline")
    .setURL(`https://mcstatus.io/status/java/${dbData.serverIp}:${dbData.serverPort}`)
    .setFooter({ text: "Last updated", iconURL: client.user?.displayAvatarURL() })
    .addFields(fields)
    .setTimestamp();

  if (faviconAttachment) {
    embed.setThumbnail("attachment://server-icon.png");
  }

  return { embeds: [embed], files: faviconAttachment ? [faviconAttachment] : [], content: "" };
}
