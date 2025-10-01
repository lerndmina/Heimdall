/**
 * Ready event - Fired when the bot successfully connects to Discord
 */
import type { Client } from "discord.js";
import log from "../../utils/log";

export default (client: Client<true>) => {
  log.info(`🤖 Logged in as ${client.user.tag}`);
  log.info(`📊 Ready in ${client.guilds.cache.size} guilds (may be 0 for user-only bot)`);

  // Set bot presence
  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "User commands",
        type: 3, // Watching
      },
    ],
  });
};
