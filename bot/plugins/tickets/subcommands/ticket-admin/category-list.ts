/**
 * /ticket-admin category list - List all ticket categories
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import type { LibAPI } from "../../../lib/index.js";
import { CategoryType } from "../../types/index.js";

export async function handleCategoryList(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;
  const lib = getPluginAPI<LibAPI>("lib")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const typeFilter = interaction.options.getString("type") as "parent" | "child" | null;

    const categories = await tickets.categoryService.getGuildCategories(interaction.guild.id, typeFilter === "parent" ? CategoryType.PARENT : typeFilter === "child" ? CategoryType.CHILD : undefined);

    if (categories.length === 0) {
      await interaction.editReply({ content: "❌ No categories found." });
      return;
    }

    const embed = lib.createEmbedBuilder().setTitle("📋 Ticket Categories").setDescription(`Found **${categories.length}** categories`).setColor("Blue");

    // Group by parent/child
    const parents = categories.filter((c) => c.type === CategoryType.PARENT);
    const children = categories.filter((c) => c.type === CategoryType.CHILD);

    if (parents.length > 0) {
      const text = parents.map((c) => `${c.emoji || "📁"} **${c.name}** (\`${c.id}\`)`).join("\n");
      embed.addFields({ name: "Parent Categories", value: text.substring(0, 1024) });
    }

    if (children.length > 0) {
      const text = children
        .map((c) => {
          const status = c.isActive ? "✅" : "❌";
          return `${c.emoji || "📄"} **${c.name}** ${status} (\`${c.id}\`)`;
        })
        .join("\n");
      embed.addFields({ name: "Child Categories", value: text.substring(0, 1024) });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to list categories." });
  }
}
