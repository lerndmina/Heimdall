/**
 * Client Ready event - Fired when the bot successfully connects to Discord
 * Note: This event was renamed from 'ready' to 'clientReady' in Discord.js v14
 */
import type { Client } from "discord.js";
import log from "../../utils/log";

export default async (client: Client<true>) => {
  log.info(`🤖 Logged in as ${client.user.tag}`);

  // Set bot presence
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "👤 User commands everywhere",
        type: 3, // Watching
      },
    ],
  });
};
