/**
 * TicketArchiveCleanupService - Scheduled cleanup of expired archived tickets
 *
 * Runs daily to find and delete archived tickets that have exceeded their expiry period.
 * Deletes both the Discord channel and the database record.
 */

import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import Ticket from "../models/Ticket.js";
import { TicketStatus } from "../types/index.js";

// Default archive expiry in days
const DEFAULT_ARCHIVE_EXPIRE_DAYS = 30;

export class TicketArchiveCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_FREQUENCY = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private client: HeimdallClient,
    private logger: PluginLogger,
    private lib: LibAPI,
    private archiveExpireDays: number = DEFAULT_ARCHIVE_EXPIRE_DAYS,
  ) {}

  /**
   * Start the archive cleanup service
   */
  start(): void {
    if (this.cleanupInterval) {
      this.logger.warn("TicketArchiveCleanupService already running");
      return;
    }

    this.logger.info(`Starting TicketArchiveCleanupService (expiry: ${this.archiveExpireDays} days)...`);

    // Check immediately on start
    this.cleanupExpiredArchives();

    // Then check every 24 hours
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredArchives();
    }, this.CHECK_FREQUENCY);

    this.logger.info("TicketArchiveCleanupService started");
  }

  /**
   * Stop the archive cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.info("TicketArchiveCleanupService stopped");
    }
  }

  /**
   * Find and delete expired archived tickets
   */
  private async cleanupExpiredArchives(): Promise<void> {
    try {
      this.logger.debug("Running archive cleanup check...");

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - this.archiveExpireDays);

      const expiredTickets = await Ticket.find({
        status: TicketStatus.ARCHIVED,
        archivedAt: { $lt: expiryDate },
      });

      if (expiredTickets.length === 0) {
        this.logger.debug("No expired archives found");
        return;
      }

      this.logger.info(`Found ${expiredTickets.length} expired archived ticket(s) to clean up`);

      let deleted = 0;
      let failed = 0;

      for (const ticket of expiredTickets) {
        try {
          // Try to delete Discord channel
          const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
          if (channel && "delete" in channel) {
            await (channel as any).delete(`Archive expired (${this.archiveExpireDays} days)`);
            this.logger.debug(`Deleted channel ${ticket.channelId} for ticket ${ticket.ticketNumber}`);
          }

          // Delete ticket from database
          await Ticket.deleteOne({ id: ticket.id });
          deleted++;
          this.logger.info(`Cleaned up expired ticket ${ticket.ticketNumber} (${ticket.guildId})`);
        } catch (error) {
          failed++;
          this.logger.error(`Failed to cleanup ticket ${ticket.id}:`, error);
        }
      }

      this.logger.info(`Archive cleanup complete: ${deleted} deleted, ${failed} failed`);
    } catch (error) {
      this.logger.error("Error during archive cleanup:", error);
    }
  }

  /**
   * Manual trigger for cleanup (for admin commands)
   * @returns Object with count of deleted and failed tickets
   */
  async manualCleanup(): Promise<{ deleted: number; failed: number }> {
    this.logger.info("Manual archive cleanup triggered");

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - this.archiveExpireDays);

    const expiredTickets = await Ticket.find({
      status: TicketStatus.ARCHIVED,
      archivedAt: { $lt: expiryDate },
    });

    let deleted = 0;
    let failed = 0;

    for (const ticket of expiredTickets) {
      try {
        const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
        if (channel && "delete" in channel) {
          await (channel as any).delete("Manual archive cleanup");
        }

        await Ticket.deleteOne({ id: ticket.id });
        deleted++;
      } catch (error) {
        failed++;
        this.logger.error(`Failed to cleanup ticket ${ticket.id}:`, error);
      }
    }

    this.logger.info(`Manual cleanup complete: ${deleted} deleted, ${failed} failed`);
    return { deleted, failed };
  }
}
