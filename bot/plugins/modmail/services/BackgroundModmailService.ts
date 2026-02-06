/**
 * BackgroundModmailService - Background processing for modmail maintenance
 *
 * Handles:
 * - Auto-close warnings for inactive modmails
 * - Auto-close of inactive modmails
 * - Orphaned thread detection (deleted by staff)
 * - Resolve auto-close (after marked resolved)
 */

import type { Client } from "discord.js";
import type { ModmailService } from "./ModmailService.js";
import Modmail, { type IModmail, ModmailStatus } from "../models/Modmail.js";
import ModmailConfig, { type IModmailConfig } from "../models/ModmailConfig.js";
import { ModmailEmbeds } from "../utils/ModmailEmbeds.js";
import { createCloseTicketRow } from "../utils/modmailButtons.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { ThingGetter } from "../../lib/utils/ThingGetter.js";
import type { LibAPI } from "../../lib/index.js";

/**
 * Statistics tracked by the background service
 */
export interface BackgroundModmailStats {
  warningsSent: number;
  threadsClosed: number;
  orphansDetected: number;
  resolveClosures: number;
  errors: number;
  lastRun: Date | null;
  isRunning: boolean;
}

/**
 * BackgroundModmailService - Processes modmails on a configurable interval
 */
export class BackgroundModmailService {
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;
  private stats: BackgroundModmailStats = {
    warningsSent: 0,
    threadsClosed: 0,
    orphansDetected: 0,
    resolveClosures: 0,
    errors: 0,
    lastRun: null,
    isRunning: false,
  };

  constructor(
    private client: Client,
    private modmailService: ModmailService,
    private thingGetter: ThingGetter,
    private lib: LibAPI,
    private logger: PluginLogger,
    private intervalMinutes: number = 10,
  ) {}

  /**
   * Start the background processor on interval
   */
  start(): void {
    if (this.processingInterval) {
      this.logger.warn("BackgroundModmailService already started");
      return;
    }

    this.logger.info(`Starting BackgroundModmailService (${this.intervalMinutes}-minute intervals)`);

    // Process immediately — plugins are loaded inside the ready event
    // so the client and channel cache are guaranteed to be available.
    this.processModmails();

    this.processingInterval = setInterval(
      () => {
        this.processModmails();
      },
      this.intervalMinutes * 60 * 1000,
    );

    this.stats.isRunning = true;
  }

  /**
   * Stop the background processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
      this.stats.isRunning = false;
      this.logger.info("BackgroundModmailService stopped");
    }
  }

  /**
   * Main processing loop - fetches open modmails and processes them
   */
  private async processModmails(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug("Already processing, skipping cycle");
      return;
    }

    this.isProcessing = true;
    this.stats.lastRun = new Date();

    // Reset per-cycle stats so they don't accumulate across runs
    this.stats.warningsSent = 0;
    this.stats.threadsClosed = 0;
    this.stats.orphansDetected = 0;
    this.stats.resolveClosures = 0;
    this.stats.errors = 0;

    try {
      // Get all open and resolved modmails (resolved for auto-close check)
      const modmails = await Modmail.find({
        status: { $in: [ModmailStatus.OPEN, ModmailStatus.RESOLVED] },
      }).lean();

      if (modmails.length === 0) {
        this.logger.debug("No open/resolved modmails to process");
        return;
      }

      // Group by guild for efficient config fetching
      const modmailsByGuild = new Map<string, IModmail[]>();
      for (const modmail of modmails) {
        const guildModmails = modmailsByGuild.get(modmail.guildId) || [];
        guildModmails.push(modmail as IModmail);
        modmailsByGuild.set(modmail.guildId, guildModmails);
      }

      // Process each guild's modmails
      for (const [guildId, guildModmails] of modmailsByGuild) {
        await this.processGuildModmails(guildId, guildModmails);
      }

      this.logger.info(`Cycle complete - Warnings: ${this.stats.warningsSent}, ` + `Closed: ${this.stats.threadsClosed}, Orphans: ${this.stats.orphansDetected}`);
    } catch (error) {
      this.logger.error("Error in maintenance cycle:", error);
      this.stats.errors++;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process modmails for a specific guild
   */
  private async processGuildModmails(guildId: string, modmails: IModmail[]): Promise<void> {
    // Fetch config for this guild
    const config = await ModmailConfig.findOne({ guildId }).lean();
    if (!config) {
      this.logger.debug(`No config for guild ${guildId}, skipping`);
      return;
    }

    for (const modmail of modmails) {
      try {
        // Check for orphaned thread first (deleted externally)
        const isOrphaned = await this.checkOrphanedThread(modmail, guildId);
        if (isOrphaned) continue;

        // Handle resolved modmails differently
        if (modmail.status === ModmailStatus.RESOLVED) {
          await this.checkResolveAutoClose(modmail, config as IModmailConfig);
          continue;
        }

        // For open modmails, check warnings and auto-close
        await this.checkAndSendWarning(modmail, config as IModmailConfig);
        await this.checkAndAutoClose(modmail, config as IModmailConfig);
      } catch (error) {
        this.logger.error(`Error processing modmail ${modmail.modmailId}:`, error);
        this.stats.errors++;
      }
    }
  }

  /**
   * Detect deleted forum threads and close the modmail
   */
  private async checkOrphanedThread(modmail: IModmail, _guildId: string): Promise<boolean> {
    // Skip if thread still pending
    if (modmail.forumThreadId === "pending") return false;

    try {
      // ThingGetter checks cache first, then falls back to API.
      // Returns null when the channel genuinely doesn't exist.
      const channel = await this.thingGetter.getChannel(modmail.forumThreadId);

      if (!channel) {
        this.logger.warn(`Orphaned thread detected for modmail ${modmail.modmailId}`);

        // Mark as closed
        await Modmail.updateOne(
          { modmailId: modmail.modmailId },
          {
            status: ModmailStatus.CLOSED,
            closedAt: new Date(),
            closedBy: this.client.user?.id || "system",
            closeReason: "Thread deleted externally",
          },
        );

        // Try to notify user
        const user = await this.thingGetter.getUser(modmail.userId);
        if (user) {
          try {
            await user.send({
              embeds: [ModmailEmbeds.threadClosed("System", "The support thread was deleted. If you still need help, please send a new message.")],
            });
          } catch {
            // Ignore DM failures
          }
        }

        this.stats.orphansDetected++;
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error checking orphaned thread for ${modmail.modmailId}:`, error);
      return false;
    }
  }

  /**
   * Send inactivity warning to user and thread
   */
  private async checkAndSendWarning(modmail: IModmail, config: IModmailConfig): Promise<void> {
    // Skip if per-ticket disabled, warning already sent, or guild-level warning disabled
    if (modmail.autoCloseDisabled || modmail.autoCloseWarningAt) return;
    if (config.enableInactivityWarning === false) return;

    const autoCloseHours = config.autoCloseHours || 72;
    const warningHours = config.autoCloseWarningHours || 48;
    const autoCloseEnabled = config.enableAutoClose !== false;

    // Use the most recent of user or staff activity as the reference point
    const lastUserActivity = new Date(modmail.lastUserActivityAt).getTime();
    const lastStaffActivity = modmail.lastStaffActivityAt ? new Date(modmail.lastStaffActivityAt).getTime() : 0;
    const lastAnyActivity = Math.max(lastUserActivity, lastStaffActivity);

    const inactiveMs = Date.now() - lastAnyActivity;
    const inactiveHours = inactiveMs / (1000 * 60 * 60);

    // Send warning if past warning threshold but not yet at auto-close
    if (inactiveHours >= warningHours && inactiveHours < autoCloseHours) {
      const hoursRemaining = Math.max(0, autoCloseHours - inactiveHours);
      const inactiveDuration = formatTimeHours(inactiveHours);
      const autoCloseCountdown = formatTimeHours(hoursRemaining);

      // DM user with rich inactivity notice + close button
      const user = await this.thingGetter.getUser(modmail.userId);
      if (user) {
        try {
          const closeRow = await createCloseTicketRow(this.lib);
          await user.send({
            embeds: [ModmailEmbeds.inactivityNotice(inactiveDuration, autoCloseEnabled, autoCloseCountdown)],
            components: [closeRow],
          });
        } catch {
          /* ignore — user may have DMs disabled */
        }
      }

      // Post in thread with concise staff version
      const thread = await this.thingGetter.getChannel(modmail.forumThreadId);
      if (thread?.isThread()) {
        try {
          await thread.send({
            embeds: [ModmailEmbeds.autoCloseWarning(inactiveDuration, autoCloseCountdown)],
          });
        } catch {
          /* ignore */
        }
      }

      // Update warning timestamp
      await Modmail.updateOne({ modmailId: modmail.modmailId }, { autoCloseWarningAt: new Date() });
      this.stats.warningsSent++;
    }
  }

  /**
   * Execute a background close sequence: DM user → post in thread → close DB → finalize thread.
   * Shared logic for all auto-close paths.
   */
  private async executeBackgroundClose(modmail: IModmail, params: { dmReason: string; threadMessage: string; closeReason: string }): Promise<void> {
    const { dmReason, threadMessage, closeReason } = params;

    // DM user with close embed
    const user = await this.thingGetter.getUser(modmail.userId);
    if (user) {
      try {
        await user.send({
          embeds: [ModmailEmbeds.threadClosed("System", dmReason)],
        });
      } catch {
        /* ignore — user may have DMs disabled */
      }
    }

    // Post info embed in staff thread
    const thread = await this.thingGetter.getChannel(modmail.forumThreadId);
    if (thread?.isThread()) {
      try {
        await thread.send({
          embeds: [ModmailEmbeds.info("Auto-Closed", threadMessage)],
        });
      } catch {
        /* ignore */
      }
    }

    // Close in database
    await this.modmailService.closeModmail({
      modmailId: modmail.modmailId,
      closedBy: this.client.user?.id || "system",
      reason: closeReason,
      isStaff: true,
    });

    // Disable buttons, lock, and archive
    await this.modmailService.finalizeThread(modmail.forumThreadId);
  }

  /**
   * Close modmail after inactivity threshold
   */
  private async checkAndAutoClose(modmail: IModmail, config: IModmailConfig): Promise<void> {
    if (modmail.autoCloseDisabled) return;
    if (modmail.status !== ModmailStatus.OPEN) return;
    if (config.enableAutoClose === false) return;

    const autoCloseHours = config.autoCloseHours || 72;

    // Calculate inactivity - same logic as model's canAutoClose method
    const inactiveTime = Date.now() - new Date(modmail.lastUserActivityAt).getTime();
    const inactiveHours = inactiveTime / (1000 * 60 * 60);

    if (inactiveHours < autoCloseHours) return;

    await this.executeBackgroundClose(modmail, {
      dmReason: `Auto-closed after ${autoCloseHours} hours of inactivity.`,
      threadMessage: `Closed after **${autoCloseHours} hours** of inactivity.`,
      closeReason: `Auto-closed after ${autoCloseHours}h inactivity`,
    });

    this.stats.threadsClosed++;
  }

  /**
   * Close resolved modmails after delay
   */
  private async checkResolveAutoClose(modmail: IModmail, config: IModmailConfig): Promise<void> {
    // Only for resolved modmails
    if (modmail.status !== ModmailStatus.RESOLVED) return;
    if (!modmail.resolveAutoCloseAt) return;

    // Check if past resolve auto-close time
    if (new Date() >= new Date(modmail.resolveAutoCloseAt)) {
      await this.executeBackgroundClose(modmail, {
        dmReason: "Your resolved thread has been closed. Thank you for using our support system!",
        threadMessage: "Resolved modmail closed automatically.",
        closeReason: "Resolved modmail auto-closed",
      });

      this.stats.resolveClosures++;
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): BackgroundModmailStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      warningsSent: 0,
      threadsClosed: 0,
      orphansDetected: 0,
      resolveClosures: 0,
      errors: 0,
      lastRun: this.stats.lastRun, // Preserve last run time
      isRunning: this.stats.isRunning, // Preserve running state
    };
  }

  /**
   * Trigger immediate processing (for admin commands)
   */
  async forceProcess(): Promise<void> {
    await this.processModmails();
  }
}

/**
 * Format a number of hours into a human-readable duration string.
 * Examples: "1 day", "2 hours 30 minutes", "45 minutes"
 */
function formatTimeHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);

  if (totalMinutes < 1) return "less than a minute";

  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes !== 1 ? "s" : ""}`;
  }

  if (hours >= 24) {
    const wholeDays = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    const parts: string[] = [];
    parts.push(`${wholeDays} day${wholeDays !== 1 ? "s" : ""}`);
    if (remainingHours > 0) {
      parts.push(`${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`);
    }
    return parts.join(" ");
  }

  const wholeHours = Math.floor(hours);
  const remainingMinutes = Math.round((hours - wholeHours) * 60);
  const parts: string[] = [];
  if (wholeHours > 0) {
    parts.push(`${wholeHours} hour${wholeHours !== 1 ? "s" : ""}`);
  }
  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);
  }
  return parts.join(" ");
}
