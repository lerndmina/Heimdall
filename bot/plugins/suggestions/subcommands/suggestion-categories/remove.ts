/**
 * /suggestion-categories remove — Remove a suggestion category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-remove");

export async function handleRemove(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const categoryId = interaction.options.getString("category", true);

    const category = await SuggestionConfigHelper.getCategory(interaction.guildId!, categoryId);
    if (!category) {
      await interaction.reply({ content: "❌ Category not found.", ephemeral: true });
      return;
    }

    const result = await SuggestionConfigHelper.removeCategory(interaction.guildId!, categoryId);

    if (!result.success) {
      await interaction.reply({ content: `❌ Failed to remove category: ${result.error}`, ephemeral: true });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("🗑️ Category Removed")
      .setDescription(`Category **${category.emoji || "📁"} ${category.name}** has been removed successfully.`)
      .setColor(0xff6b6b)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log.error("Error removing category:", error);
    await interaction.reply({ content: "❌ An error occurred while removing the category.", ephemeral: true });
  }
}
