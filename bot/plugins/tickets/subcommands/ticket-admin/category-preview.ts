/**
 * /ticket-admin category preview - Preview the question flow for a category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import type { LibAPI } from "../../../lib/index.js";
import { CategoryType } from "../../types/index.js";

export async function handleCategoryPreview(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;
  const lib = getPluginAPI<LibAPI>("lib")!;

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
      await interaction.editReply({ content: "❌ Only child categories can be previewed." });
      return;
    }

    // Build preview embed
    const embed = lib
      .createEmbedBuilder()
      .setTitle(`📋 Category Preview: ${category.name}`)
      .setDescription(category.description || "No description")
      .setColor("Blue");

    // Show select questions
    const sortedSelectQuestions = [...(category.selectQuestions || [])].sort((a, b) => a.order - b.order);
    if (sortedSelectQuestions.length > 0) {
      const text = sortedSelectQuestions
        .map((q, idx) => {
          const options = q.options.map((o) => `\`${o.label}\``).join(", ");
          return `${idx + 1}. **${q.label}** ${q.required ? "(required)" : ""}\n   Options: ${options}`;
        })
        .join("\n\n");
      embed.addFields({ name: "🔹 Select Questions", value: text.substring(0, 1024) });
    } else {
      embed.addFields({ name: "🔹 Select Questions", value: "_No select questions configured_" });
    }

    // Show modal questions
    const sortedModalQuestions = [...(category.modalQuestions || [])].sort((a, b) => a.order - b.order);
    if (sortedModalQuestions.length > 0) {
      const text = sortedModalQuestions
        .map((q, idx) => {
          const style = q.style === "short" ? "Short text" : "Paragraph";
          return `${idx + 1}. **${q.label}** (${style}) ${q.required ? "(required)" : ""}${q.placeholder ? `\n   Placeholder: "${q.placeholder}"` : ""}`;
        })
        .join("\n\n");
      embed.addFields({ name: "📝 Modal Questions", value: text.substring(0, 1024) });
    } else {
      embed.addFields({ name: "📝 Modal Questions", value: "_No modal questions configured_" });
    }

    // Show category settings
    embed.addFields({
      name: "⚙️ Settings",
      value:
        `**Ticket Name Format:** \`${category.ticketNameFormat}\`\n` +
        `**Discord Category:** ${category.discordCategoryId ? `<#${category.discordCategoryId}>` : "Not set"}\n` +
        `**Staff Roles:** ${category.staffRoles?.length || 0} configured\n` +
        `**Active:** ${category.isActive ? "Yes" : "No"}`,
    });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to start preview." });
  }
}
