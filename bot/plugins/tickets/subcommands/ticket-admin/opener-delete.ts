/**
 * /ticket-admin opener delete - Delete a ticket opener
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import TicketOpener from "../../models/TicketOpener.js";

export async function handleOpenerDelete(context: CommandContext): Promise<void> {
  const { interaction } = context;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const openerId = interaction.options.getString("opener", true);

    const opener = await TicketOpener.findOne({ id: openerId, guildId: interaction.guild.id });
    if (!opener) {
      await interaction.editReply({ content: "❌ Opener not found." });
      return;
    }

    const name = opener.name;
    await opener.deleteOne();

    await interaction.editReply({ content: `✅ Deleted opener: **${name}**` });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to delete opener." });
  }
}
