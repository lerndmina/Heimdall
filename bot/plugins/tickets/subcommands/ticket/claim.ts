/**
 * /ticket claim - Claim the current ticket
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";

export async function handleClaim(context: CommandContext): Promise<void> {
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
    const result = await tickets.lifecycleService.claimTicket(ticket, interaction.user, member);

    await interaction.editReply({
      content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while claiming the ticket." });
  }
}
