/**
 * /suggestion-categories list — List all suggestion categories
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-list");

export async function handleList(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);
    const categories = await SuggestionConfigHelper.getAllCategories(interaction.guildId!);

    const embed = pluginAPI.lib.createEmbedBuilder().setTitle("📂 Suggestion Categories").setColor(0x0099ff).setTimestamp();

    if (!guildConfig?.enableCategories) {
      embed.setDescription("❌ **Categories are currently disabled**\n\nUse `/suggestion-categories toggle enabled:true` to enable them.");
    } else if (categories.length === 0) {
      embed.setDescription("No categories have been created yet.\n\nUse `/suggestion-categories add` to create your first category.");
    } else {
      let description = `**Categories enabled**: ✅\n**Total categories**: ${categories.length}/${guildConfig.maxCategories}\n\n`;

      categories.forEach((cat, index) => {
        const status = cat.isActive ? "✅" : "❌";
        const channelInfo = cat.channelId ? ` (Channel: <#${cat.channelId}>)` : " (All channels)";
        const displayEmoji = cat.emoji || "📁";

        description += `${index + 1}. ${status} ${displayEmoji} **${cat.name}**${channelInfo}\n`;
        description += `   *${cat.description}*\n\n`;
      });

      embed.setDescription(description);
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log.error("Error listing categories:", error);
    await interaction.reply({ content: "❌ An error occurred while listing categories.", ephemeral: true });
  }
}
