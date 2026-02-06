/**
 * /suggestion-categories toggle — Enable or disable categories feature
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-toggle");

export async function handleToggle(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const enabled = interaction.options.getBoolean("enabled", true);

    const result = await SuggestionConfigHelper.toggleCategories(interaction.guildId!, enabled, interaction.user.id);

    if (!result.success) {
      await interaction.reply({ content: `❌ Failed to toggle categories: ${result.error}`, ephemeral: true });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(enabled ? "✅ Categories Enabled" : "❌ Categories Disabled")
      .setDescription(
        enabled
          ? "Suggestion categories are now enabled. Users will be able to select categories when submitting suggestions."
          : "Suggestion categories are now disabled. Users will submit suggestions without category selection.",
      )
      .setColor(enabled ? 0x00ff00 : 0xff6b6b)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log.error("Error toggling categories:", error);
    await interaction.reply({ content: "❌ An error occurred while toggling categories.", ephemeral: true });
  }
}
