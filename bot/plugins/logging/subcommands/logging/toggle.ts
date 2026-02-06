/**
 * /logging toggle — Toggle specific subcategories within a category
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LoggingPluginAPI } from "../../index.js";
import { LoggingCategory, MessageSubcategory, UserSubcategory, ModerationSubcategory } from "../../models/LoggingConfig.js";

const VALID_SUBCATEGORIES: Record<string, string[]> = {
  [LoggingCategory.MESSAGES]: Object.values(MessageSubcategory),
  [LoggingCategory.USERS]: Object.values(UserSubcategory),
  [LoggingCategory.MODERATION]: Object.values(ModerationSubcategory),
};

export async function handleToggle(context: CommandContext, pluginAPI: LoggingPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const categoryStr = interaction.options.getString("category", true);
  const subcategoryStr = interaction.options.getString("subcategory", true);
  const enabled = interaction.options.getBoolean("enabled", true);

  const category = categoryStr as LoggingCategory;
  if (!Object.values(LoggingCategory).includes(category)) {
    await interaction.editReply("❌ Invalid category specified.");
    return;
  }

  const valid = VALID_SUBCATEGORIES[category];
  if (!valid || !valid.includes(subcategoryStr)) {
    await interaction.editReply(`❌ Invalid subcategory for **${categoryStr}** category.`);
    return;
  }

  const result = await pluginAPI.loggingService.toggleSubcategory(interaction.guildId!, category, subcategoryStr, enabled);

  if (!result.success) {
    await interaction.editReply(`❌ Failed to toggle subcategory: ${result.error}`);
    return;
  }

  const formattedSubcat = subcategoryStr.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  const statusEmoji = enabled ? "✅" : "❌";
  const statusText = enabled ? "enabled" : "disabled";
  const label = categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1);

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(enabled ? 0x00ff00 : 0xff6b6b)
    .setTitle(`${statusEmoji} Subcategory ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`)
    .setDescription(`**${formattedSubcat}** in **${label}** logging is now **${statusText}**.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
