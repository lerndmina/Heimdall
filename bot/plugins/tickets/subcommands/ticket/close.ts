/**
 * /ticket close - Close the current ticket
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";

export async function handleClose(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get ticket from current channel
    const ticket = await tickets.utils.getTicketFromChannel(interaction);
    if (!ticket) {
      await interaction.editReply({ content: "❌ This command can only be used in a ticket channel." });
      return;
    }

    const member = interaction.member as GuildMember;
    const result = await tickets.lifecycleService.closeTicket(ticket, interaction.user, member);

    await interaction.editReply({
      content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while closing the ticket." });
  }
}
