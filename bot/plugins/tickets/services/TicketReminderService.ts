/**
 * TicketReminderService - Manages ticket inactivity reminders and auto-close
 *
 * Uses ScheduledAction model from support-core for persistence across restarts.
 * Runs a cron-style processor every minute to check for due actions.
 */

import type { TextChannel } from "discord.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import type { SupportCoreAPI } from "../../support-core/index.js";
import Ticket, { type ITicket } from "../models/Ticket.js";
import TicketCategory, { type ITicketCategory } from "../models/TicketCategory.js";
import { TicketStatus, ReminderPingBehavior, DEFAULT_WARNING_DELAY, DEFAULT_CLOSE_DELAY } from "../types/index.js";

// Action types for scheduled actions
export enum TicketReminderAction {
  INACTIVITY_WARNING = "ticket_inactivity_warning",
  AUTO_CLOSE = "ticket_auto_close",
}

// Hook ID for this service
const HOOK_ID = "ticket_reminder_service";

/**
 * Format milliseconds into a human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days} day${days !== 1 ? "s" : ""} and ${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`;
    }
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (hours > 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}

export class TicketReminderService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_FREQUENCY = 60000; // Check every 1 minute
  private isProcessing = false;

  constructor(
    private client: HeimdallClient,
    private logger: PluginLogger,
    private lib: LibAPI,
    private supportCore: SupportCoreAPI,
  ) {}

  /**
   * Get the support instance ID for a ticket
   */
  private getSupportInstanceId(ticketId: string): `ticket:${string}` {
    return `ticket:${ticketId}`;
  }

  /**
   * Start the scheduled action processor
   */
  start(): void {
    if (this.checkInterval) {
      this.logger.warn("TicketReminderService already running");
      return;
    }

    this.logger.info("Starting TicketReminderService (1 minute interval)...");

    // Check immediately on start
    this.processScheduledActions();

    // Then check every minute
    this.checkInterval = setInterval(() => {
      this.processScheduledActions();
    }, this.CHECK_FREQUENCY);

    this.logger.info("TicketReminderService started");
  }

  /**
   * Stop the scheduled action processor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.info("TicketReminderService stopped");
    }
  }

  /**
   * Process any due scheduled actions
   */
  private async processScheduledActions(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { ScheduledAction } = this.supportCore;

      // Find all due actions for this hook
      const dueActions = await ScheduledAction.find({
        hookId: HOOK_ID,
        processed: false,
        executeAt: { $lte: new Date() },
      }).limit(50);

      if (dueActions.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${dueActions.length} due ticket reminder actions`);

      for (const action of dueActions) {
        try {
          const payload = action.payload as { ticketId: string; categoryId: string };

          if (action.action === TicketReminderAction.INACTIVITY_WARNING) {
            await this.sendWarning(payload.ticketId, payload.categoryId);
          } else if (action.action === TicketReminderAction.AUTO_CLOSE) {
            await this.autoCloseTicket(payload.ticketId);
          }

          // Mark as processed
          action.processed = true;
          action.processedAt = new Date();
          await action.save();
        } catch (error) {
          this.logger.error(`Error processing action ${action.actionId}:`, error);
          action.processed = true;
          action.processedAt = new Date();
          action.error = String(error);
          await action.save();
        }
      }
    } catch (error) {
      this.logger.error("Error in processScheduledActions:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Schedule an inactivity warning for a ticket
   */
  async scheduleInactivityWarning(ticket: ITicket, category: ITicketCategory): Promise<void> {
    if (!category.inactivityReminder?.enabled || ticket.reminderExempt) {
      return;
    }

    if (ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.ARCHIVED) {
      return;
    }

    const warningDelay = category.inactivityReminder.warningDelay || DEFAULT_WARNING_DELAY;
    const executeAt = new Date(Date.now() + warningDelay);
    const supportInstanceId = this.getSupportInstanceId(ticket.id);

    // Cancel any existing warning timer
    await this.cancelAction(supportInstanceId, TicketReminderAction.INACTIVITY_WARNING);

    // Create new scheduled action
    const { ScheduledAction } = this.supportCore;
    const action = new ScheduledAction({
      supportInstanceId,
      guildId: ticket.guildId,
      hookId: HOOK_ID,
      action: TicketReminderAction.INACTIVITY_WARNING,
      executeAt,
      payload: { ticketId: ticket.id, categoryId: category.id },
    });

    await action.save();
    this.logger.debug(`Scheduled inactivity warning for ticket ${ticket.id} at ${executeAt.toISOString()}`);
  }

  /**
   * Schedule auto-close for a ticket (after warning is sent)
   */
  async scheduleAutoClose(ticket: ITicket, category: ITicketCategory): Promise<void> {
    if (!category.inactivityReminder?.enabled || ticket.reminderExempt) {
      return;
    }

    const closeDelay = category.inactivityReminder.closeDelay || DEFAULT_CLOSE_DELAY;
    const executeAt = new Date(Date.now() + closeDelay);
    const supportInstanceId = this.getSupportInstanceId(ticket.id);

    await this.cancelAction(supportInstanceId, TicketReminderAction.AUTO_CLOSE);

    const { ScheduledAction } = this.supportCore;
    const action = new ScheduledAction({
      supportInstanceId,
      guildId: ticket.guildId,
      hookId: HOOK_ID,
      action: TicketReminderAction.AUTO_CLOSE,
      executeAt,
      payload: { ticketId: ticket.id, categoryId: category.id },
    });

    await action.save();
    this.logger.debug(`Scheduled auto-close for ticket ${ticket.id} at ${executeAt.toISOString()}`);
  }

  /**
   * Cancel a specific action type for a ticket
   */
  private async cancelAction(supportInstanceId: `ticket:${string}`, action: TicketReminderAction): Promise<void> {
    const { ScheduledAction } = this.supportCore;
    await ScheduledAction.updateMany({ supportInstanceId, hookId: HOOK_ID, action, processed: false }, { processed: true, processedAt: new Date(), error: "Cancelled" });
  }

  /**
   * Cancel all reminder timers for a ticket
   */
  async cancelAllTimers(ticketId: string): Promise<void> {
    const supportInstanceId = this.getSupportInstanceId(ticketId);
    const { ScheduledAction } = this.supportCore;

    await ScheduledAction.updateMany({ supportInstanceId, hookId: HOOK_ID, processed: false }, { processed: true, processedAt: new Date(), error: "Cancelled - all timers" });

    this.logger.debug(`Cancelled all timers for ticket ${ticketId}`);
  }

  /**
   * Handle activity in a ticket (resets timers)
   */
  async handleActivity(ticketId: string): Promise<void> {
    const ticket = await Ticket.findOne({ id: ticketId });
    if (!ticket || ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.ARCHIVED) {
      return;
    }

    if (ticket.reminderExempt) return;

    const category = await TicketCategory.findOne({ id: ticket.categoryId });
    if (!category || !category.inactivityReminder?.enabled) return;

    // Update last activity timestamp
    ticket.lastActivityAt = new Date();

    // Delete warning message if exists
    if (ticket.reminderState?.warningMessageId) {
      await this.deleteWarningMessage(ticket);
      ticket.reminderState = {};
    }

    await ticket.save();

    // Cancel pending auto-close and reschedule warning
    await this.cancelAction(this.getSupportInstanceId(ticketId), TicketReminderAction.AUTO_CLOSE);
    await this.scheduleInactivityWarning(ticket, category);

    this.logger.debug(`Activity recorded for ticket ${ticketId}, timers reset`);
  }

  /**
   * Delete the warning message from a ticket channel
   */
  private async deleteWarningMessage(ticket: ITicket): Promise<void> {
    if (!ticket.reminderState?.warningMessageId) return;

    try {
      const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const message = await (channel as TextChannel).messages.fetch(ticket.reminderState.warningMessageId).catch(() => null);
        if (message) await message.delete();
      }
    } catch (error) {
      this.logger.warn(`Failed to delete warning message for ticket ${ticket.id}:`, error);
    }
  }

  /**
   * Send an inactivity warning to a ticket
   */
  async sendWarning(ticketId: string, categoryId: string): Promise<void> {
    const ticket = await Ticket.findOne({ id: ticketId });
    if (!ticket || ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.ARCHIVED || ticket.reminderExempt) {
      return;
    }

    const category = await TicketCategory.findOne({ id: categoryId });
    if (!category || !category.inactivityReminder?.enabled) return;

    const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const textChannel = channel as TextChannel;

    // Build ping content
    let pingContent = "";
    const pingBehavior = category.inactivityReminder.pingBehavior || ReminderPingBehavior.OPENER;
    if (pingBehavior === ReminderPingBehavior.OPENER) {
      pingContent = `<@${ticket.userId}>`;
    } else if (pingBehavior === ReminderPingBehavior.ALL) {
      const mentions = [`<@${ticket.userId}>`];
      if (ticket.claimedBy) mentions.push(`<@${ticket.claimedBy}>`);
      pingContent = mentions.join(" ");
    }

    // Build warning embed
    const closeDelay = category.inactivityReminder.closeDelay || DEFAULT_CLOSE_DELAY;
    const embed = this.lib
      .createEmbedBuilder()
      .setTitle("⚠️ Inactivity Warning")
      .setDescription(`This ticket has been inactive. If no response is received within **${formatDuration(closeDelay)}**, it will be automatically closed.`)
      .setColor("Yellow")
      .setTimestamp();

    const message = await textChannel.send({
      content: pingContent || undefined,
      embeds: [embed],
    });

    // Update ticket with warning state
    ticket.reminderState = {
      warningMessageId: message.id,
      warningSentAt: new Date(),
    };
    await ticket.save();

    // Schedule auto-close
    await this.scheduleAutoClose(ticket, category);

    this.logger.info(`Sent inactivity warning for ticket ${ticketId}`);
  }

  /**
   * Auto-close a ticket due to inactivity
   */
  private async autoCloseTicket(ticketId: string): Promise<void> {
    const ticket = await Ticket.findOne({ id: ticketId });
    if (!ticket || ticket.status === TicketStatus.CLOSED || ticket.status === TicketStatus.ARCHIVED) {
      return;
    }

    const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const textChannel = channel as TextChannel;

    // Lock channel
    await textChannel.permissionOverwrites.edit(textChannel.guild.id, {
      SendMessages: false,
    });

    // Update ticket
    await Ticket.updateOne(
      { id: ticketId },
      {
        status: TicketStatus.CLOSED,
        closedAt: new Date(),
        closedBy: this.client.user?.id || "system",
        closeReason: "Ticket Inactivity",
      },
    );

    // Send close message
    const embed = this.lib.createEmbedBuilder().setTitle("🔒 Ticket Auto-Closed").setDescription("This ticket has been automatically closed due to inactivity.").setColor("Red").setTimestamp();

    await textChannel.send({ embeds: [embed] });

    this.logger.info(`Auto-closed ticket ${ticketId} due to inactivity`);
  }
}
