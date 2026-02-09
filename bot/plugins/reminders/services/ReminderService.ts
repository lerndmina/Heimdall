/**
 * ReminderService — Background polling, CRUD operations, and DM delivery
 *
 * Polls MongoDB every 10 seconds for due reminders and delivers them
 * via Discord DM with rich context embeds.
 */

import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import Reminder, { type IReminder } from "../models/Reminder.js";
import { ReminderContextService } from "./ReminderContextService.js";
import { EmbedBuilder, time, TimestampStyles } from "discord.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

const log = createLogger("reminders:service");

/** Maximum reminders per user */
export const MAX_REMINDERS_PER_USER = 100;

/** Polling interval in milliseconds */
const POLL_INTERVAL_MS = 10_000;

/** Batch size per poll cycle */
const POLL_BATCH_SIZE = 50;

/** Reminder document with Mongoose metadata */
type ReminderDocument = IReminder & { _id: any; createdAt: Date; updatedAt: Date };

export class ReminderService {
  private client: HeimdallClient;
  private lib: LibAPI;
  private contextService: ReminderContextService;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: HeimdallClient, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
    this.contextService = new ReminderContextService();
  }

  // ── Lifecycle ──────────────────────────────────────────

  /** Start background polling for due reminders */
  start(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      this.pollAndDeliver().catch((error) => {
        log.error("Reminder poll cycle failed:", error);
      });
    }, POLL_INTERVAL_MS);

    log.info("Reminder polling started (10s interval)");
  }

  /** Stop background polling */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      log.info("Reminder polling stopped");
    }
  }

  // ── Polling & Delivery ─────────────────────────────────

  /** Find and deliver all due reminders */
  private async pollAndDeliver(): Promise<void> {
    const now = new Date();

    const dueReminders = (await Reminder.find({
      triggered: false,
      triggerAt: { $lte: now },
    })
      .limit(POLL_BATCH_SIZE)
      .lean()) as ReminderDocument[];

    if (dueReminders.length === 0) return;

    log.debug(`Processing ${dueReminders.length} due reminder(s)`);

    for (const reminder of dueReminders) {
      await this.triggerReminder(reminder);
    }
  }

  /** Deliver a single reminder via DM */
  private async triggerReminder(reminder: ReminderDocument): Promise<void> {
    try {
      // Mark as triggered first to prevent re-delivery
      await Reminder.updateOne({ _id: reminder._id }, { $set: { triggered: true } });
      if (reminder.guildId && reminder.guildId !== "dm") {
        broadcastDashboardChange(reminder.guildId, "reminders", "reminder_triggered", {
          requiredAction: "reminders.view_reminders",
        });
      }

      const user = await this.lib.thingGetter.getUser(reminder.userId);
      if (!user) {
        log.warn(`Cannot deliver reminder ${reminder._id}: user ${reminder.userId} not found`);
        return;
      }

      // Build delivery embed
      const embed = new EmbedBuilder().setTitle("⏰ Reminder").setDescription(reminder.message).setColor(0x5865f2).setTimestamp();

      // Add guild info
      if (reminder.guildName) {
        embed.addFields({ name: "Server", value: reminder.guildName, inline: true });
      }

      // Add creation time
      embed.addFields({
        name: "Set",
        value: time(reminder.createdAt, TimestampStyles.RelativeTime),
        inline: true,
      });

      // Add context information if present
      if (reminder.contextType && reminder.contextId) {
        const freshContext = await this.contextService.refreshContext(reminder.contextType, reminder.contextId);

        const contextData = freshContext ?? reminder.contextData;

        if (contextData) {
          const contextLines: string[] = [];

          if (reminder.contextType === "ticket") {
            contextLines.push(`**Type:** Ticket`);
            if (contextData.ticketNumber != null) contextLines.push(`**Ticket:** #${contextData.ticketNumber}`);
            if (contextData.categoryName) contextLines.push(`**Category:** ${contextData.categoryName}`);
            if (contextData.openedBy) contextLines.push(`**Opened By:** <@${contextData.openedBy}>`);
            if (contextData.claimedBy) contextLines.push(`**Claimed By:** <@${contextData.claimedBy}>`);
          } else if (reminder.contextType === "modmail") {
            contextLines.push(`**Type:** Modmail`);
            if (contextData.ticketNumber != null) contextLines.push(`**Ticket:** #${contextData.ticketNumber}`);
            if (contextData.userName) contextLines.push(`**User:** ${contextData.userName}`);
            if (contextData.priority != null) contextLines.push(`**Priority:** ${contextData.priority}`);
          }

          if (contextLines.length > 0) {
            embed.addFields({ name: "Context", value: contextLines.join("\n") });
          }
        }
      }

      // Add source channel link
      if (reminder.sourceChannelId) {
        embed.addFields({
          name: "Channel",
          value: `<#${reminder.sourceChannelId}>`,
          inline: true,
        });
      }

      try {
        await user.send({ embeds: [embed] });
        log.debug(`Delivered reminder ${reminder._id} to ${user.tag}`);
      } catch {
        log.warn(`Failed to DM reminder to ${user.tag} (DMs may be closed)`);
      }
    } catch (error) {
      log.error(`Error triggering reminder ${reminder._id}:`, error);
    }
  }

  // ── CRUD ──────────────────────────────────────────────

  /** Create a new reminder */
  async createReminder(data: {
    userId: string;
    guildId: string;
    channelId: string;
    message: string;
    triggerAt: Date;
    contextType?: string | null;
    contextId?: string | null;
    contextData?: Record<string, unknown> | null;
    sourceChannelId?: string;
    guildName?: string;
  }): Promise<ReminderDocument> {
    // Check limit
    const count = await Reminder.countDocuments({ userId: data.userId, triggered: false });
    if (count >= MAX_REMINDERS_PER_USER) {
      throw new Error(`Maximum of ${MAX_REMINDERS_PER_USER} active reminders reached`);
    }

    const reminder = await Reminder.create(data);
    log.debug(`Reminder created for user ${data.userId}: "${data.message}" at ${data.triggerAt.toISOString()}`);
    return reminder as unknown as ReminderDocument;
  }

  /** Get a single reminder by ID (with ownership check) */
  async getReminder(reminderId: string, userId: string): Promise<ReminderDocument | null> {
    return Reminder.findOne({ _id: reminderId, userId }).lean() as Promise<ReminderDocument | null>;
  }

  /** List reminders for a user with pagination */
  async getUserReminders(
    userId: string,
    options?: { includeTriggered?: boolean; sort?: "triggerAt" | "createdAt"; limit?: number; offset?: number },
  ): Promise<{ reminders: ReminderDocument[]; total: number }> {
    const { includeTriggered = false, sort = "triggerAt", limit = 10, offset = 0 } = options ?? {};

    const query: Record<string, unknown> = { userId };
    if (!includeTriggered) {
      query.triggered = false;
    }

    const sortObj: Record<string, 1 | -1> = {};
    if (sort === "triggerAt") sortObj.triggerAt = 1;
    else sortObj.createdAt = -1;

    const [reminders, total] = await Promise.all([Reminder.find(query).sort(sortObj).limit(limit).skip(offset).lean() as Promise<ReminderDocument[]>, Reminder.countDocuments(query)]);

    return { reminders, total };
  }

  /** Update a reminder (only if not yet triggered) */
  async updateReminder(reminderId: string, userId: string, updates: { message?: string; triggerAt?: Date }): Promise<ReminderDocument | null> {
    const reminder = await Reminder.findOne({ _id: reminderId, userId });
    if (!reminder) return null;
    if (reminder.triggered) throw new Error("Cannot update a triggered reminder");

    const updateFields: Record<string, unknown> = {};
    if (updates.message !== undefined) updateFields.message = updates.message;
    if (updates.triggerAt !== undefined) {
      if (updates.triggerAt <= new Date()) throw new Error("Trigger time must be in the future");
      updateFields.triggerAt = updates.triggerAt;
    }

    const updated = await Reminder.findOneAndUpdate({ _id: reminderId, userId }, { $set: updateFields }, { new: true, runValidators: true }).lean();

    if (updated) log.debug(`Reminder ${reminderId} updated for user ${userId}`);
    return updated as ReminderDocument | null;
  }

  /** Cancel (delete) a reminder */
  async cancelReminder(reminderId: string, userId: string): Promise<boolean> {
    const result = await Reminder.deleteOne({ _id: reminderId, userId, triggered: false });
    if (result.deletedCount > 0) {
      log.debug(`Reminder ${reminderId} cancelled by user ${userId}`);
      return true;
    }
    return false;
  }

  /** Count active reminders for a user */
  async countActiveReminders(userId: string): Promise<number> {
    return Reminder.countDocuments({ userId, triggered: false });
  }

  /** Get the context service for external use */
  getContextService(): ReminderContextService {
    return this.contextService;
  }
}
