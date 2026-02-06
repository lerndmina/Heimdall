/**
 * /ticket-admin category delete - Delete a ticket category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";

export async function handleCategoryDelete(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const categoryId = interaction.options.getString("category", true);

    const category = await tickets.categoryService.getCategory(categoryId);
    if (!category || category.guildId !== interaction.guild.id) {
      await interaction.editReply({ content: "❌ Category not found." });
      return;
    }

    const result = await tickets.categoryService.deleteCategory(categoryId);

    if (result.success) {
      await interaction.editReply({ content: `✅ Deleted category: **${category.name}**` });
    } else {
      await interaction.editReply({ content: `❌ ${result.message}` });
    }
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to delete category." });
  }
}
