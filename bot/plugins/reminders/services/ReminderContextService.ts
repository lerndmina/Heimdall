/**
 * ReminderContextService — Detect and refresh ticket/modmail context for reminders
 *
 * Queries the Ticket and Modmail models (optional dependencies) to enrich
 * reminders with contextual data. Handles cases where those plugins aren't loaded
 * by gracefully returning null.
 */

import { createLogger } from "../../../src/core/Logger.js";
import type { ReminderContextType } from "../models/Reminder.js";

// Import models directly — these are mongoose models, so they're available
// as long as the plugin registered them. We catch import failures gracefully.
import Ticket from "../../tickets/models/Ticket.js";
import Modmail from "../../modmail/models/Modmail.js";
import { TicketStatus } from "../../tickets/types/index.js";
import { ModmailStatus } from "../../modmail/models/Modmail.js";

const log = createLogger("reminders:context");

/** Context detection result */
export interface DetectedContext {
  contextType: ReminderContextType;
  contextId: string;
  contextData: {
    ticketNumber?: number;
    categoryName?: string;
    openedBy?: string;
    claimedBy?: string;
    userName?: string;
    priority?: number;
  };
}

export class ReminderContextService {
  /**
   * Detect if a channel is associated with an open ticket or modmail thread.
   * Returns context data or null if no context found.
   */
  async detectContext(channelId: string, guildId: string): Promise<DetectedContext | null> {
    // Try ticket first
    try {
      const ticket = await Ticket.findOne({
        channelId,
        guildId,
        status: { $in: [TicketStatus.OPEN, TicketStatus.CLAIMED] },
      }).lean();

      if (ticket) {
        log.debug(`Detected ticket context: #${ticket.ticketNumber} in channel ${channelId}`);
        return {
          contextType: "ticket",
          contextId: ticket.id as string,
          contextData: {
            ticketNumber: ticket.ticketNumber,
            categoryName: ticket.categoryName,
            openedBy: ticket.openedBy,
            claimedBy: ticket.claimedBy ?? undefined,
          },
        };
      }
    } catch {
      log.debug("Ticket model not available, skipping ticket context detection");
    }

    // Try modmail (forum thread ID matches the channel ID)
    try {
      const modmail = await Modmail.findOne({
        forumThreadId: channelId,
        status: { $ne: ModmailStatus.CLOSED },
      }).lean();

      if (modmail) {
        log.debug(`Detected modmail context: #${modmail.ticketNumber} in thread ${channelId}`);
        return {
          contextType: "modmail",
          contextId: modmail.modmailId as string,
          contextData: {
            ticketNumber: modmail.ticketNumber,
            userName: modmail.userDisplayName,
            priority: modmail.priority ?? undefined,
          },
        };
      }
    } catch {
      log.debug("Modmail model not available, skipping modmail context detection");
    }

    return null;
  }

  /**
   * Refresh context data for an existing reminder (re-fetch current state).
   * Used when delivering a reminder to show the latest ticket/modmail status.
   */
  async refreshContext(contextType: ReminderContextType, contextId: string): Promise<DetectedContext["contextData"] | null> {
    try {
      if (contextType === "ticket") {
        const ticket = await Ticket.findOne({ id: contextId }).lean();
        if (!ticket) return null;
        return {
          ticketNumber: ticket.ticketNumber,
          categoryName: ticket.categoryName,
          openedBy: ticket.openedBy,
          claimedBy: ticket.claimedBy ?? undefined,
        };
      }

      if (contextType === "modmail") {
        const modmail = await Modmail.findOne({ modmailId: contextId }).lean();
        if (!modmail) return null;
        return {
          ticketNumber: modmail.ticketNumber,
          userName: modmail.userDisplayName,
          priority: modmail.priority ?? undefined,
        };
      }
    } catch (error) {
      log.debug(`Failed to refresh ${contextType} context for ${contextId}:`, error);
    }

    return null;
  }
}
