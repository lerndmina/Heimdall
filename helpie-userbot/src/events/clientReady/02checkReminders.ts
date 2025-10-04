/**
 * Check Reminders - Ready Event Handler
 * Initializes all pending reminders on bot startup
 * Similar to the main bot's checkpolls.ts system
 */

import type { Client } from "discord.js";
import log from "../../utils/log";
import ReminderService from "../../utils/ReminderService";

export default async (client: Client<true>) => {
  try {
    // Wait a bit to ensure client is fully ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    log.info("Checking for pending reminders...");

    // Initialize reminder service and load all pending reminders
    const reminderService = new ReminderService(client);
    await reminderService.initializeReminders();

    log.info("Reminder initialization complete");
  } catch (error) {
    log.error("Failed to initialize reminders:", error);
  }
};
