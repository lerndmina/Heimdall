/**
 * TicketLifecycleService - Ticket state transitions and channel management
 */

import type { TextChannel, User, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import Ticket, { type ITicket } from "../models/Ticket.js";
import TicketCategory from "../models/TicketCategory.js";
import { TicketStatus } from "../types/index.js";

export class TicketLifecycleService {
  constructor(
    private client: HeimdallClient,
    private logger: PluginLogger,
    private lib: LibAPI,
  ) {}

  /**
   * Generate ticket channel name from format template
   * Tokens: {number}, {openerusername}, {claimant}, {categoryname}
   */
  generateTicketName(format: string, ticketNumber: number, openerUsername: string, claimantUsername: string | null, categoryName: string): string {
    const paddedNumber = String(ticketNumber).padStart(3, "0");

    let name = format
      .replace(/{number}/g, paddedNumber)
      .replace(/{openerusername}/g, openerUsername)
      .replace(/{claimant}/g, claimantUsername || "")
      .replace(/{categoryname}/g, categoryName);

    // Sanitize for Discord channel name requirements
    name = name
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Enforce 100 character limit
    return name.length > 100 ? name.substring(0, 100) : name;
  }

  /**
   * Set ticket channel name
   * Respects customChannelName to prevent overwriting manual renames
   */
  async setTicketChannelName(ticket: ITicket, newName: string, reason?: string, isManualRename = false): Promise<boolean> {
    try {
      // Skip if custom name and not manual
      if (ticket.customChannelName && !isManualRename) {
        this.logger.debug(`Ticket ${ticket.id} has custom name, skipping auto-rename`);
        return true;
      }

      const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        return false;
      }

      await (channel as TextChannel).setName(newName, reason);

      if (isManualRename) {
        await Ticket.updateOne({ id: ticket.id }, { customChannelName: newName });
        this.logger.info(`Ticket ${ticket.id} manually renamed to "${newName}"`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to rename ticket ${ticket.id}:`, error);
      return false;
    }
  }

  /**
   * Get next ticket number for guild
   */
  async getNextTicketNumber(guildId: string): Promise<number> {
    const highest = await Ticket.findOne({ guildId }).sort({ ticketNumber: -1 }).limit(1).lean();
    return highest ? highest.ticketNumber + 1 : 1;
  }

  /**
   * Claim a ticket
   */
  async claimTicket(ticket: ITicket, user: User, member: GuildMember): Promise<{ success: boolean; message: string }> {
    if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
      return { success: false, message: "Ticket is already closed." };
    }
    if (ticket.claimedBy) {
      return { success: false, message: "Ticket is already claimed." };
    }

    const category = await TicketCategory.findOne({ id: ticket.categoryId });
    if (!category) return { success: false, message: "Category not found." };

    // Permission check: user must have staff role
    const hasPermission = category.staffRoles.some((sr) => member.roles.cache.has(sr.roleId));
    if (!hasPermission && !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { success: false, message: "You don't have permission to claim tickets." };
    }

    // Update ticket
    await Ticket.updateOne(
      { id: ticket.id },
      {
        claimedBy: user.id,
        claimedAt: new Date(),
        status: TicketStatus.CLAIMED,
      },
    );

    // Update channel name
    const openerUser = await this.lib.thingGetter.getUser(ticket.userId);
    const openerName = openerUser ? this.lib.thingGetter.getUsername(openerUser) : "unknown";
    const claimerName = this.lib.thingGetter.getUsername(user);

    const newName = this.generateTicketName(category.ticketNameFormat, ticket.ticketNumber, openerName, claimerName, category.name);
    await this.setTicketChannelName(ticket, newName, `Claimed by ${user.tag}`);

    // Send notification in channel
    const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      const embed = this.lib.createEmbedBuilder().setColor("Green").setTitle("🎫 Ticket Claimed").setDescription(`This ticket has been claimed by ${user}.`).setTimestamp();
      await (channel as TextChannel).send({ embeds: [embed] });
    }

    broadcastDashboardChange(ticket.guildId, "tickets", "ticket_claimed", {
      requiredAction: "tickets.manage_tickets",
    });

    return { success: true, message: "Ticket claimed successfully." };
  }

  /**
   * Unclaim a ticket
   */
  async unclaimTicket(ticket: ITicket, user: User, member: GuildMember): Promise<{ success: boolean; message: string }> {
    if (ticket.status !== TicketStatus.CLAIMED) {
      return { success: false, message: "Ticket is not claimed." };
    }

    const category = await TicketCategory.findOne({ id: ticket.categoryId });
    if (!category) return { success: false, message: "Category not found." };

    // Permission check
    const hasPermission = category.staffRoles.some((sr) => member.roles.cache.has(sr.roleId));
    if (!hasPermission && !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { success: false, message: "You don't have permission." };
    }

    await Ticket.updateOne(
      { id: ticket.id },
      {
        $unset: { claimedBy: 1, claimedAt: 1 },
        status: TicketStatus.OPEN,
      },
    );

    // Update channel name
    const openerUser = await this.lib.thingGetter.getUser(ticket.userId);
    const openerName = openerUser ? this.lib.thingGetter.getUsername(openerUser) : "unknown";

    const newName = this.generateTicketName(category.ticketNameFormat, ticket.ticketNumber, openerName, null, category.name);
    await this.setTicketChannelName(ticket, newName, `Unclaimed by ${user.tag}`);

    const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
    if (channel?.isTextBased() && !channel.isDMBased()) {
      const embed = this.lib.createEmbedBuilder().setColor("Yellow").setTitle("🎫 Ticket Unclaimed").setDescription(`This ticket has been unclaimed by ${user}.`).setTimestamp();
      await (channel as TextChannel).send({ embeds: [embed] });
    }

    broadcastDashboardChange(ticket.guildId, "tickets", "ticket_unclaimed", {
      requiredAction: "tickets.manage_tickets",
    });

    return { success: true, message: "Ticket unclaimed successfully." };
  }

  /**
   * Close a ticket
   */
  async closeTicket(ticket: ITicket, user: User, member: GuildMember, reason?: string): Promise<{ success: boolean; message: string }> {
    if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
      return { success: false, message: "Ticket is already closed." };
    }

    const category = await TicketCategory.findOne({ id: ticket.categoryId });
    if (!category) return { success: false, message: "Category not found." };

    // Permission: staff or ticket opener
    const isStaff = category.staffRoles.some((sr) => member.roles.cache.has(sr.roleId));
    const isOpener = ticket.userId === user.id;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isStaff && !isOpener && !isAdmin) {
      return { success: false, message: "You don't have permission to close this ticket." };
    }

    const channel = await this.lib.thingGetter.getChannel(ticket.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      return { success: false, message: "Ticket channel not found." };
    }
    const textChannel = channel as TextChannel;

    // Lock channel
    await textChannel.permissionOverwrites.edit(member.guild.id, {
      SendMessages: false,
    });

    // Update ticket status
    await Ticket.updateOne(
      { id: ticket.id },
      {
        status: TicketStatus.CLOSED,
        closedAt: new Date(),
        closedBy: user.id,
      },
    );

    // Send close message
    const embed = this.lib
      .createEmbedBuilder()
      .setColor("Red")
      .setTitle("🔒 Ticket Closed")
      .setDescription(`Ticket closed by ${user}.${reason ? `\n**Reason:** ${reason}` : ""}`)
      .setTimestamp();
    await textChannel.send({ embeds: [embed] });

    broadcastDashboardChange(ticket.guildId, "tickets", "ticket_closed", {
      requiredAction: "tickets.manage_tickets",
    });

    // TODO: Emit event for support-core (transcript, archive, etc.)

    return { success: true, message: "Ticket closed successfully." };
  }

  /**
   * Rename a ticket manually
   */
  async renameTicket(ticket: ITicket, newName: string, user: User, member: GuildMember): Promise<{ success: boolean; message: string }> {
    if (ticket.status === TicketStatus.ARCHIVED || ticket.status === TicketStatus.CLOSED) {
      return { success: false, message: "Cannot rename closed ticket." };
    }

    const category = await TicketCategory.findOne({ id: ticket.categoryId });
    if (!category) return { success: false, message: "Category not found." };

    const isStaff = category.staffRoles.some((sr) => member.roles.cache.has(sr.roleId));
    if (!isStaff && !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return { success: false, message: "You don't have permission." };
    }

    const success = await this.setTicketChannelName(ticket, newName, `Renamed by ${user.tag}`, true);
    if (success) {
      broadcastDashboardChange(ticket.guildId, "tickets", "ticket_renamed", {
        requiredAction: "tickets.manage_tickets",
      });
    }
    return success ? { success: true, message: `Ticket renamed to "${newName}"` } : { success: false, message: "Failed to rename ticket." };
  }
}
