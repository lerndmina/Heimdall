/**
 * /ticket-admin opener edit - Edit a ticket opener
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import TicketOpener from "../../models/TicketOpener.js";
import TicketCategory from "../../models/TicketCategory.js";
import { CategoryType } from "../../types/index.js";

export async function handleOpenerEdit(context: CommandContext): Promise<void> {
  const { interaction } = context;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const openerId = interaction.options.getString("opener", true);
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color");
    const addCategoryId = interaction.options.getString("category");
    const removeCategoryId = interaction.options.getString("remove_category");

    const opener = await TicketOpener.findOne({ id: openerId, guildId: interaction.guild.id });
    if (!opener) {
      await interaction.editReply({ content: "❌ Opener not found." });
      return;
    }

    // Apply updates
    if (title) opener.embedTitle = title;
    if (description) opener.embedDescription = description;
    if (color) {
      // Parse hex color to number
      const colorHex = color.replace("#", "");
      const colorNum = parseInt(colorHex, 16);
      if (!isNaN(colorNum)) {
        opener.embedColor = colorNum;
      }
    }

    // Add category
    if (addCategoryId) {
      const category = await TicketCategory.findOne({
        id: addCategoryId,
        guildId: interaction.guild.id,
        type: CategoryType.CHILD,
      });
      if (!category) {
        await interaction.editReply({ content: "❌ Category not found or not a child category." });
        return;
      }
      if (!opener.categoryIds.includes(addCategoryId)) {
        opener.categoryIds.push(addCategoryId);
      }
    }

    // Remove category
    if (removeCategoryId) {
      opener.categoryIds = opener.categoryIds.filter((id) => id !== removeCategoryId);
    }

    await opener.save();

    await interaction.editReply({
      content: `✅ Updated opener: **${opener.name}**\nCategories: ${opener.categoryIds.length}`,
    });
    broadcastDashboardChange(interaction.guild.id, "tickets", "opener_updated", {
      requiredAction: "tickets.manage_openers",
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to update opener." });
  }
}
