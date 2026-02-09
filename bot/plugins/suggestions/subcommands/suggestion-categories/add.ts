/**
 * /suggestion-categories add — Add a new suggestion category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-add");

export async function handleAdd(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const name = interaction.options.getString("name", true);
    const description = interaction.options.getString("description", true);
    const emoji = interaction.options.getString("emoji");
    const channel = interaction.options.getChannel("channel");

    const result = await SuggestionConfigHelper.addCategory(interaction.guildId!, name, description, emoji || undefined, channel?.id || undefined, interaction.user.id);

    if (!result.success) {
      await interaction.reply({ content: `❌ Failed to add category: ${result.error}`, ephemeral: true });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("✅ Category Added Successfully")
      .setColor(0x00ff00)
      .addFields(
        { name: "Name", value: `${emoji || "📁"} ${name}`, inline: true },
        { name: "Description", value: description, inline: true },
        { name: "Channel", value: channel ? `<#${channel.id}>` : "All channels", inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    broadcastDashboardChange(interaction.guildId!, "suggestions", "category_added", { requiredAction: "suggestions.manage_categories" });
  } catch (error) {
    log.error("Error adding category:", error);
    await interaction.reply({ content: "❌ An error occurred while adding the category.", ephemeral: true });
  }
}
