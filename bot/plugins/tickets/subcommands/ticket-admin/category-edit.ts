/**
 * /ticket-admin category edit - Edit a ticket category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import TicketCategory from "../../models/TicketCategory.js";

export async function handleCategoryEdit(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const categoryId = interaction.options.getString("category", true);
    const name = interaction.options.getString("name");
    const description = interaction.options.getString("description");
    const emoji = interaction.options.getString("emoji");
    const ticketNameFormat = interaction.options.getString("ticket_name_format");
    const active = interaction.options.getBoolean("active");

    const category = await tickets.categoryService.getCategory(categoryId);
    if (!category || category.guildId !== interaction.guild.id) {
      await interaction.editReply({ content: "❌ Category not found." });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (name !== null) updates.name = name;
    if (description !== null) updates.description = description;
    if (emoji !== null) updates.emoji = emoji;
    if (ticketNameFormat !== null) updates.ticketNameFormat = ticketNameFormat;
    if (active !== null) updates.isActive = active;

    if (Object.keys(updates).length === 0) {
      await interaction.editReply({ content: "❌ No changes specified." });
      return;
    }

    const result = await tickets.categoryService.updateCategory(categoryId, updates);

    if (result) {
      await interaction.editReply({ content: `✅ Updated category: **${category.name}**` });
    } else {
      await interaction.editReply({ content: "❌ Failed to update category." });
    }
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to update category." });
  }
}
