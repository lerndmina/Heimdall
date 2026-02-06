/**
 * /ticket keepopen - Toggle inactivity reminder exemption
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import TicketCategory from "../../models/TicketCategory.js";
import Ticket from "../../models/Ticket.js";

export async function handleKeepOpen(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const ticket = await tickets.utils.getTicketFromChannel(interaction);
    if (!ticket) {
      await interaction.editReply({ content: "❌ This command can only be used in a ticket channel." });
      return;
    }

    const member = interaction.member as GuildMember;

    // Get category for permission check
    const category = await TicketCategory.findOne({ id: ticket.categoryId });

    const canManage = tickets.utils.canManageTicket(member, ticket, category || undefined);
    if (!canManage) {
      await interaction.editReply({ content: "❌ You don't have permission to manage this ticket." });
      return;
    }

    // Toggle exemption
    const newValue = !ticket.reminderExempt;
    await Ticket.updateOne({ id: ticket.id }, { reminderExempt: newValue });

    await interaction.editReply({
      content: newValue ? "✅ Ticket is now exempt from inactivity reminders." : "✅ Ticket will now receive inactivity reminders.",
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred." });
  }
}
