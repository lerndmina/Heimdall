/**
 * /ticket move - Move ticket to a different category
 */

import type { GuildMember, TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import TicketCategory from "../../models/TicketCategory.js";
import Ticket from "../../models/Ticket.js";
import { CategoryType } from "../../types/index.js";

export async function handleMove(context: CommandContext): Promise<void> {
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

    const categoryId = interaction.options.getString("category", true);
    const member = interaction.member as GuildMember;

    // Get current category for permission check
    const currentCategory = await TicketCategory.findOne({ id: ticket.categoryId });

    // Check permission
    const canManage = tickets.utils.canManageTicket(member, ticket, currentCategory || undefined);
    if (!canManage) {
      await interaction.editReply({ content: "❌ You don't have permission to move this ticket." });
      return;
    }

    // Validate new category
    const newCategory = await tickets.categoryService.getCategory(categoryId);
    if (!newCategory || newCategory.guildId !== interaction.guild.id) {
      await interaction.editReply({ content: "❌ Category not found." });
      return;
    }

    if (newCategory.type !== CategoryType.CHILD) {
      await interaction.editReply({ content: "❌ Can only move tickets to child categories." });
      return;
    }

    if (!newCategory.discordCategoryId) {
      await interaction.editReply({ content: "❌ Target category has no Discord category configured." });
      return;
    }

    // Get the ticket channel
    const channel = await interaction.guild.channels.fetch(ticket.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({ content: "❌ Could not find ticket channel." });
      return;
    }

    // Move the channel
    await (channel as TextChannel).setParent(newCategory.discordCategoryId, {
      reason: `Moved by ${interaction.user.tag}`,
    });

    // Update ticket document
    await Ticket.updateOne(
      { id: ticket.id },
      {
        categoryId: newCategory.id,
        categoryName: newCategory.name,
      },
    );

    await interaction.editReply({
      content: `✅ Ticket moved to category: **${newCategory.name}**`,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while moving the ticket." });
  }
}
