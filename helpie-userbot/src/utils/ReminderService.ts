/**
 * Reminder Service
 * Core logic for creating, scheduling, and sending reminders
 * Following DRY principle - used by both slash command and context menu
 */

import { Client, EmbedBuilder, User } from "discord.js";
import ReminderModel, { ReminderType } from "../models/Reminder";
import log from "./log";
import HelpieReplies from "./HelpieReplies";

// Track active timeouts to prevent duplicates
const activeTimeouts = new Map<string, NodeJS.Timeout>();

export interface CreateReminderOptions {
  userId: string;
  content: string;
  remindAt: Date;
  messageUrl?: string;
  channelId?: string;
  messageId?: string;
  guildId?: string;
}

export class ReminderService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Create a new reminder and schedule it
   */
  async createReminder(options: CreateReminderOptions): Promise<{ success: boolean; reminderId?: string; error?: string }> {
    try {
      // Generate unique reminder ID
      const reminderId = `reminder-${options.userId}-${Date.now()}`;

      // Validate time is in the future
      if (options.remindAt.getTime() <= Date.now()) {
        return { success: false, error: "Reminder time must be in the future" };
      }

      // Max reminder time: 1 year
      const maxTime = Date.now() + 365 * 24 * 60 * 60 * 1000;
      if (options.remindAt.getTime() > maxTime) {
        return { success: false, error: "Reminder time cannot be more than 1 year in the future" };
      }

      // Create reminder in database
      const reminder = new ReminderModel({
        reminderId,
        userId: options.userId,
        content: options.content,
        remindAt: options.remindAt,
        messageUrl: options.messageUrl,
        channelId: options.channelId,
        messageId: options.messageId,
        guildId: options.guildId,
        completed: false,
      });

      await reminder.save();
      log.info(`Created reminder ${reminderId} for user ${options.userId} at ${options.remindAt.toISOString()}`);

      // Schedule the reminder
      this.scheduleReminder(reminder as unknown as ReminderType);

      return { success: true, reminderId };
    } catch (error: any) {
      log.error("Failed to create reminder:", error);
      return { success: false, error: error.message || "Unknown error" };
    }
  }

  /**
   * Schedule a reminder to be sent at the specified time
   */
  scheduleReminder(reminder: ReminderType): void {
    // Check if already scheduled
    if (activeTimeouts.has(reminder.reminderId)) {
      log.debug(`Reminder ${reminder.reminderId} already scheduled, skipping`);
      return;
    }

    const now = Date.now();
    const remindTime = new Date(reminder.remindAt).getTime();
    const delay = remindTime - now;

    if (delay <= 0) {
      // Should send immediately
      log.info(`Reminder ${reminder.reminderId} is overdue, sending immediately`);
      this.sendReminder(reminder);
      return;
    }

    // setTimeout has a max of ~24.8 days (32-bit signed int)
    // If reminder is further out, we'll reschedule it on next bot restart
    const MAX_TIMEOUT = 2147483647; // Max 32-bit signed integer
    const scheduleDelay = Math.min(delay, MAX_TIMEOUT);

    log.info(`Scheduling reminder ${reminder.reminderId} to fire in ${Math.floor(scheduleDelay / 1000)}s`);

    const timeout = setTimeout(async () => {
      await this.sendReminder(reminder);
    }, scheduleDelay);

    activeTimeouts.set(reminder.reminderId, timeout);
  }

  /**
   * Send the reminder to the user via DM
   */
  async sendReminder(reminder: ReminderType): Promise<void> {
    try {
      log.info(`Sending reminder ${reminder.reminderId} to user ${reminder.userId}`);

      // Fetch the user
      const user = await this.client.users.fetch(reminder.userId).catch(() => null);
      if (!user) {
        log.error(`Failed to fetch user ${reminder.userId} for reminder ${reminder.reminderId}`);
        await this.markReminderCompleted(reminder.reminderId);
        return;
      }

      // Build reminder embed
      const embed = new EmbedBuilder()
        .setColor(0x5865f2) // Blurple
        .setTitle("⏰ Reminder")
        .setDescription(reminder.content)
        .addFields({
          name: "Set At",
          value: `<t:${Math.floor(new Date(reminder.createdAt).getTime() / 1000)}:F>`,
          inline: true,
        })
        .setTimestamp();

      // Add message link if available
      if (reminder.messageUrl) {
        embed.addFields({
          name: "Original Message",
          value: `[Jump to Message](${reminder.messageUrl})`,
          inline: false,
        });
      }

      // Send DM
      try {
        await user.send({ embeds: [embed] });
        log.info(`Successfully sent reminder ${reminder.reminderId} to user ${reminder.userId}`);
      } catch (dmError: any) {
        log.error(`Failed to send DM for reminder ${reminder.reminderId}:`, dmError);
        // User might have DMs disabled - still mark as completed
      }

      // Mark as completed
      await this.markReminderCompleted(reminder.reminderId);

      // Remove from active timeouts
      activeTimeouts.delete(reminder.reminderId);
    } catch (error: any) {
      log.error(`Error sending reminder ${reminder.reminderId}:`, error);
      // Still mark as completed to avoid retry loops
      await this.markReminderCompleted(reminder.reminderId);
      activeTimeouts.delete(reminder.reminderId);
    }
  }

  /**
   * Mark a reminder as completed
   */
  async markReminderCompleted(reminderId: string): Promise<void> {
    try {
      await ReminderModel.findOneAndUpdate(
        { reminderId },
        {
          completed: true,
          completedAt: new Date(),
        }
      );
      log.debug(`Marked reminder ${reminderId} as completed`);
    } catch (error) {
      log.error(`Failed to mark reminder ${reminderId} as completed:`, error);
    }
  }

  /**
   * Cancel an active reminder
   */
  async cancelReminder(reminderId: string): Promise<boolean> {
    try {
      // Clear timeout if active
      const timeout = activeTimeouts.get(reminderId);
      if (timeout) {
        clearTimeout(timeout);
        activeTimeouts.delete(reminderId);
      }

      // Delete from database
      const result = await ReminderModel.findOneAndDelete({ reminderId });
      if (result) {
        log.info(`Cancelled reminder ${reminderId}`);
        return true;
      }
      return false;
    } catch (error) {
      log.error(`Failed to cancel reminder ${reminderId}:`, error);
      return false;
    }
  }

  /**
   * Get all active reminders for a user
   */
  async getUserReminders(userId: string): Promise<ReminderType[]> {
    try {
      const reminders = await ReminderModel.find({
        userId,
        completed: { $ne: true },
        remindAt: { $gt: new Date() },
      }).sort({ remindAt: 1 });

      return reminders as unknown as ReminderType[];
    } catch (error) {
      log.error(`Failed to get reminders for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Initialize reminders on bot startup
   * Load all pending reminders from database and schedule them
   */
  async initializeReminders(): Promise<void> {
    try {
      log.info("Initializing reminders from database...");

      // Find all uncompleted reminders
      const reminders = await ReminderModel.find({
        completed: { $ne: true },
      });

      if (!reminders || reminders.length === 0) {
        log.info("No pending reminders found");
        return;
      }

      log.info(`Found ${reminders.length} pending reminders`);

      let scheduled = 0;
      let purged = 0;

      for (const reminder of reminders) {
        const remindTime = new Date(reminder.remindAt).getTime();
        const now = Date.now();

        // Purge old completed reminders (older than 7 days)
        if (reminder.completed && reminder.completedAt) {
          const completedTime = new Date(reminder.completedAt).getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;

          if (now - completedTime > sevenDays) {
            await ReminderModel.findOneAndDelete({ reminderId: reminder.reminderId });
            purged++;
            continue;
          }
        }

        // Purge reminders that are too old (more than 1 day past due)
        const oneDay = 24 * 60 * 60 * 1000;
        if (remindTime + oneDay < now) {
          log.info(`Purging overdue reminder: ${reminder.reminderId}`);
          await ReminderModel.findOneAndDelete({ reminderId: reminder.reminderId });
          purged++;
          continue;
        }

        // Schedule the reminder
        this.scheduleReminder(reminder as unknown as ReminderType);
        scheduled++;
      }

      log.info(`Initialized ${scheduled} reminders, purged ${purged} old reminders`);
    } catch (error) {
      log.error("Failed to initialize reminders:", error);
    }
  }
}

export default ReminderService;
