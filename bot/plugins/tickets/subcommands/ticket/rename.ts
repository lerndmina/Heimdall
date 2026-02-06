/**
 * /ticket rename - Rename the current ticket channel
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import TicketCategory from "../../models/TicketCategory.js";

export async function handleRename(context: CommandContext): Promise<void> {
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

    const newName = interaction.options.getString("name", true);
    const member = interaction.member as GuildMember;

    // Get category for permission check
    const category = await TicketCategory.findOne({ id: ticket.categoryId });

    // Check permission
    const canManage = tickets.utils.canManageTicket(member, ticket, category || undefined);
    if (!canManage) {
      await interaction.editReply({ content: "❌ You don't have permission to rename this ticket." });
      return;
    }

    const result = await tickets.lifecycleService.renameTicket(ticket, newName, interaction.user, member);

    await interaction.editReply({
      content: result.success ? `✅ Ticket renamed to: ${newName}` : `❌ ${result.message}`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while renaming the ticket." });
  }
}
