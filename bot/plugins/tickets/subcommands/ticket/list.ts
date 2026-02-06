/**
 * /ticket list - List tickets with optional filters
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import type { LibAPI } from "../../../lib/index.js";
import Ticket from "../../models/Ticket.js";

export async function handleList(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;
  const lib = getPluginAPI<LibAPI>("lib")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const status = interaction.options.getString("status");
    const categoryId = interaction.options.getString("category");
    const userId = interaction.options.getUser("user")?.id;

    // Build query
    const query: Record<string, unknown> = { guildId: interaction.guild.id };
    if (status) query.status = status;
    if (categoryId) query.categoryId = categoryId;
    if (userId) query.userId = userId;

    const ticketList = await Ticket.find(query).sort({ createdAt: -1 }).limit(100);

    if (ticketList.length === 0) {
      await interaction.editReply({ content: "❌ No tickets found matching your filters." });
      return;
    }

    // Build embed
    const embed = lib.createEmbedBuilder().setTitle("🎫 Ticket List").setDescription(`Found **${ticketList.length}** ticket(s)`).setColor("Blue");

    const fields = await Promise.all(
      ticketList.slice(0, 25).map(async (ticket) => {
        const opener = await lib.thingGetter.getUser(ticket.userId);
        const openerName = opener ? lib.thingGetter.getUsername(opener) : "Unknown";

        let claimantName = "Unclaimed";
        if (ticket.claimedBy) {
          const claimant = await lib.thingGetter.getUser(ticket.claimedBy);
          claimantName = claimant ? lib.thingGetter.getUsername(claimant) : "Unknown";
        }

        return {
          name: `#${ticket.ticketNumber} - ${ticket.categoryName || "Unknown"}`,
          value: `**Status:** ${ticket.status}\n**Opened by:** ${openerName}\n**Claimed by:** ${claimantName}\n**Channel:** <#${ticket.channelId}>`,
          inline: false,
        };
      }),
    );

    embed.addFields(fields);

    if (ticketList.length > 25) {
      embed.setFooter({ text: `Showing first 25 of ${ticketList.length} tickets` });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while fetching tickets." });
  }
}
