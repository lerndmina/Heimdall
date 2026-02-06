/**
 * /ticket-admin category questions - Manage category questions
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import { CategoryType } from "../../types/index.js";
import { QuestionManagementUI } from "../../utils/QuestionManagementUI.js";

export async function handleCategoryQuestions(context: CommandContext): Promise<void> {
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

    if (category.type !== CategoryType.CHILD) {
      await interaction.editReply({ content: "❌ Only child categories can have questions." });
      return;
    }

    // Build and show question management UI
    const { embed, components } = await QuestionManagementUI.buildMainPanel(category, getPluginAPI);

    await interaction.editReply({
      embeds: [embed],
      components,
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to load category questions." });
  }
}
