/**
 * Client Ready event - Fired when the bot successfully connects to Discord
 * Note: This event was renamed from 'ready' to 'clientReady' in Discord.js v14
 */
import type { Client } from "discord.js";
import log from "../../utils/log";

export default async (client: Client<true>) => {
  log.info(`🤖 Logged in as ${client.user.tag}`);

  // For user-installable bots, show user count instead of guild count
  // User bots are installed on user profiles, not guilds
  try {
    // Fetch the application to get install count
    const application = await client.application.fetch();

    // Note: Discord doesn't expose exact user install count via API
    // We can show guilds (which will be 0 for user-only bots) and DM channels
    const dmChannels = client.channels.cache.filter((c) => c.isDMBased()).size;

    log.info(`� User-installable bot ready`);
    log.info(`📱 Accessible in ${dmChannels} DM channels`);
    log.info(`🏛️  In ${client.guilds.cache.size} guilds (user-installable bots typically show 0)`);
  } catch (error) {
    log.warn("Could not fetch application details:", error);
    log.info(`📊 Ready with ${client.users.cache.size} cached users`);
  }

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
