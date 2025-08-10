import { Client } from "discord.js";
import { ModmailInactivityService } from "./ModmailInactivityService";
import { getCheckIntervalMinutes } from "../utils/ModmailUtils";
import { redisClient } from "../Bot";
import log from "../utils/log";

export class ModmailScheduler {
  private client: Client<true>;
  private inactivityService: ModmailInactivityService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private static globalSchedulerRunning: boolean = false; // Global lock in bot memory

  constructor(client: Client<true>) {
    this.client = client;
    this.inactivityService = new ModmailInactivityService(client);
  }

  /**
   * Start the modmail inactivity scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning || ModmailScheduler.globalSchedulerRunning) {
      log.warn("Modmail scheduler is already running");
      return;
    }

    const intervalMinutes = getCheckIntervalMinutes();
    const intervalMs = intervalMinutes * 60 * 1000;

    log.info(`Starting modmail inactivity scheduler - checking every ${intervalMinutes} minute(s)`);

    // Set global scheduler lock in bot memory
    ModmailScheduler.globalSchedulerRunning = true;
    this.isRunning = true;

    // Run initial check
    await this.runCheck();

    // Schedule regular checks
    this.intervalId = setInterval(async () => {
      await this.runCheck();
    }, intervalMs);

    log.debug("Modmail scheduler started successfully");
  }

  /**
   * Stop the modmail scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    log.debug("Stopping modmail scheduler...");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    ModmailScheduler.globalSchedulerRunning = false;

    log.debug("Modmail scheduler stopped");
  }

  /**
   * Run a single check cycle
   */
  private async runCheck(): Promise<void> {
    try {
      // No need to check Redis anymore - we use bot memory
      if (!this.isRunning || !ModmailScheduler.globalSchedulerRunning) {
        log.debug("Scheduler not running, skipping check");
        return;
      }

      log.debug("Running modmail inactivity check...");
      await this.inactivityService.checkInactiveModmails();

      // Update last check time in Redis for monitoring purposes only
      await redisClient.set("modmail_last_check", Date.now().toString());
    } catch (error) {
      log.error("Error during modmail inactivity check:", error);
    }
  }

  /**
   * Get the inactivity service instance
   */
  getInactivityService(): ModmailInactivityService {
    return this.inactivityService;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get last check time from Redis
   */
  async getLastCheckTime(): Promise<Date | null> {
    try {
      const timestamp = await redisClient.get("modmail_last_check");
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      log.error("Error getting last check time:", error);
      return null;
    }
  }
}
