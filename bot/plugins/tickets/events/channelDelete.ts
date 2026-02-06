/**
 * channelDelete event - Cleanup when a ticket channel is deleted
 */

import { Events, type GuildChannel } from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import Ticket from "../models/Ticket.js";
import { TicketStatus } from "../types/index.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("tickets");

export const event = Events.ChannelDelete;
export const pluginName = "tickets";

export async function execute(client: HeimdallClient, channel: GuildChannel): Promise<void> {
  try {
    // Check if this was a ticket channel
    const ticket = await Ticket.findOne({ channelId: channel.id });
    if (ticket) {
      // Mark ticket as archived if not already closed/archived
      if (ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.CLAIMED) {
        await Ticket.updateOne(
          { id: ticket.id },
          {
            status: TicketStatus.ARCHIVED,
            closedAt: new Date(),
          },
        );
        log.debug(`Marked ticket ${ticket.id} as archived (channel deleted)`);
      }
    }
  } catch (error) {
    log.error("Error handling channel delete:", error);
  }
}
