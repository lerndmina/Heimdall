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

  constructor(client: Client<true>) {
    this.client = client;
    this.inactivityService = new ModmailInactivityService(client);
  }

  /**
   * Start the modmail inactivity scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn("Modmail scheduler is already running");
      return;
    }

    const intervalMinutes = getCheckIntervalMinutes();
    const intervalMs = intervalMinutes * 60 * 1000;

    log.info(`Starting modmail inactivity scheduler - checking every ${intervalMinutes} minute(s)`);

    // Set scheduler as running in Redis
    await redisClient.set("modmail_scheduler_running", "true", { EX: 300 }); // 5 minute expiry

    // Run initial check
    await this.runCheck();

    // Schedule regular checks
    this.intervalId = setInterval(async () => {
      await this.runCheck();
    }, intervalMs);

    this.isRunning = true;

    // Keep alive heartbeat every minute
    setInterval(async () => {
      if (this.isRunning) {
        await redisClient.set("modmail_scheduler_running", "true", { EX: 300 });
      }
    }, 60 * 1000);

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
    await redisClient.del("modmail_scheduler_running");

    log.debug("Modmail scheduler stopped");
  }

  /**
   * Run a single check cycle
   */
  private async runCheck(): Promise<void> {
    try {
      // Check if another instance is running
      const isOtherRunning = await redisClient.get("modmail_scheduler_running");
      if (isOtherRunning && !this.isRunning) {
        log.debug("Another scheduler instance is running, skipping check");
        return;
      }

      log.debug("Running modmail inactivity check...");
      await this.inactivityService.checkInactiveModmails();

      // Update last check time
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
