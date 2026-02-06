/**
 * TicketPermissions - Permission utilities for tickets
 */

import type { GuildMember, APIInteractionGuildMember, BaseInteraction } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import Ticket, { type ITicket } from "../models/Ticket.js";
import type { ITicketCategory } from "../models/TicketCategory.js";

/**
 * Get ticket from channel
 */
export async function getTicketFromChannel(interaction: BaseInteraction | { channelId: string | null; guildId: string | null }): Promise<ITicket | null> {
  if (!interaction.channelId || !interaction.guildId) {
    return null;
  }

  return Ticket.findOne({
    channelId: interaction.channelId,
    guildId: interaction.guildId,
  });
}

/**
 * Check if member has staff role for a category
 */
export function hasStaffPermission(member: GuildMember | APIInteractionGuildMember, category: ITicketCategory): boolean {
  // Handle API member (raw permissions string)
  if (typeof member.permissions === "string") {
    // Can't reliably check without BitField, return false
    return false;
  }

  // ManageGuild permission grants staff access
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  // Administrator permission grants staff access
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (!category.staffRoles || category.staffRoles.length === 0) {
    return false;
  }

  // Get member roles as array
  const memberRoles = "roles" in member ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys())) : [];

  return category.staffRoles.some((sr) => memberRoles.includes(sr.roleId));
}

/**
 * Check if member can manage a ticket
 */
export function canManageTicket(member: GuildMember | APIInteractionGuildMember, ticket: ITicket, category?: ITicketCategory): boolean {
  const userId = member.user.id;

  // Owner can always manage their own ticket
  if (ticket.userId === userId) return true;

  // Staff with appropriate role can manage any ticket
  if (category && hasStaffPermission(member, category)) return true;

  // ManageGuild/Administrator permission grants access
  if (typeof member.permissions !== "string") {
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return true;
    }
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }
  }

  return false;
}
