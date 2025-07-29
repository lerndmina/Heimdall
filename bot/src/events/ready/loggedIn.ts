import { ActivityType, type ActivityOptions, type Client, PresenceStatusData } from "discord.js";
import type { CommandKit } from "commandkit";
import { redisClient } from "../../Bot";
import Database from "../../utils/data/database";
import Settings, { SettingsType } from "../../models/Settings";
import { ActivityEnum } from "../../commands/utilities/settings";
import { debugMsg } from "../../utils/TinyUtils";
import TicTacToeSchema, { TicTacToeSchemaType } from "../../models/TicTacToeSchema";
import log from "../../utils/log";
import { ModmailScheduler } from "../../services/ModmailScheduler";

const db = new Database();

// Global scheduler instance
let modmailScheduler: ModmailScheduler | null = null;

export default async (client: Client<true>, handler: CommandKit) => {
  log(`Logged in as ${client.user?.tag}`);

  const db = new Database();
  const settings = (await db.findOne(Settings, { botId: client.user?.id }, true)) as SettingsType;

  if (settings && settings.activityText) {
    debugMsg(`Setting activity to ${settings.activityText} with type ${settings.activityType}`);
    client.user.setActivity({ type: settings.activityType, name: settings.activityText });
  }

  // Set last restart
  redisClient.set(`${client.user.id}-lastRestart`, Date.now().toString());

  // Initialize modmail scheduler
  try {
    modmailScheduler = new ModmailScheduler(client);
    await modmailScheduler.start();
    log.debug("Modmail inactivity scheduler initialized successfully");
  } catch (error) {
    log.error("Failed to initialize modmail scheduler:", error);
  }
};

// Export scheduler for other modules to use if needed
export { modmailScheduler };
