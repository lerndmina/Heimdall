/**
 * TicketControlPanel - Builds control panel buttons for tickets
 */

import { ActionRowBuilder, ButtonStyle } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import type { ITicket } from "../models/Ticket.js";
import type { ITicketCategory } from "../models/TicketCategory.js";
import { TicketStatus } from "../types/index.js";

/**
 * Build the ticket control panel buttons
 */
export async function buildControlPanel(lib: LibAPI, ticket: ITicket, category: ITicketCategory): Promise<ActionRowBuilder<any>[]> {
  // No controls for closed/archived tickets
  if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
    return [];
  }

  const isUnclaimed = !ticket.claimedBy;
  const row = new ActionRowBuilder<any>();

  // Close Button
  const closeButton = lib.createButtonBuilderPersistent("ticket.control.close", {
    ticketId: ticket.id,
  });
  closeButton.setStyle(ButtonStyle.Danger).setLabel("Close Ticket").setEmoji("🔒");
  await closeButton.ready();
  row.addComponents(closeButton);

  // Claim Button (only if unclaimed)
  if (isUnclaimed) {
    const claimButton = lib.createButtonBuilderPersistent("ticket.control.claim", {
      ticketId: ticket.id,
    });
    claimButton.setStyle(ButtonStyle.Success).setLabel("Claim Ticket").setEmoji("🙋");
    await claimButton.ready();
    row.addComponents(claimButton);
  }

  // Manage Button
  const manageButton = lib.createButtonBuilderPersistent("ticket.control.manage", {
    ticketId: ticket.id,
  });
  manageButton.setStyle(ButtonStyle.Secondary).setLabel("Manage").setEmoji("⚙️");
  await manageButton.ready();
  row.addComponents(manageButton);

  return [row];
}
