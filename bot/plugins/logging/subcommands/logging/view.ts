/**
 * /logging view — View logging configuration
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LoggingPluginAPI } from "../../index.js";
import { LoggingCategory } from "../../models/LoggingConfig.js";

export async function handleView(context: CommandContext, pluginAPI: LoggingPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const categoryStr = interaction.options.getString("category");
  const guildId = interaction.guildId!;

  // View all categories
  if (!categoryStr) {
    const config = await pluginAPI.loggingService.getConfig(guildId);

    if (!config || config.categories.length === 0) {
      await interaction.editReply("❌ No logging is currently configured for this server.\n\nUse `/logging setup` to get started.");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📊 Logging Configuration")
      .setDescription(config.globalEnabled ? "Global logging is **enabled**" : "⚠️ Global logging is **disabled**")
      .setTimestamp();

    for (const cat of config.categories) {
      const statusEmoji = cat.enabled ? "✅" : "❌";
      const channelMention = `<#${cat.channelId}>`;

      const subcatList = cat.subcategories
        ? Array.from(cat.subcategories.entries())
            .map(([key, enabled]: [string, boolean]) => {
              const emoji = enabled ? "✅" : "❌";
              const formatted = key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
              return `${emoji} ${formatted}`;
            })
            .join("\n")
        : "*None*";

      const label = cat.category.charAt(0).toUpperCase() + cat.category.slice(1);
      embed.addFields({
        name: `${statusEmoji} ${label}`,
        value: `**Channel:** ${channelMention}\n**Status:** ${cat.enabled ? "Enabled" : "Disabled"}\n**Subcategories:**\n${subcatList || "*None*"}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // View specific category
  const category = categoryStr as LoggingCategory;
  if (!Object.values(LoggingCategory).includes(category)) {
    await interaction.editReply("❌ Invalid category specified.");
    return;
  }

  const config = await pluginAPI.loggingService.getConfig(guildId);
  const catConfig = config?.categories.find((c) => c.category === category);

  if (!catConfig) {
    const label = categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1);
    await interaction.editReply(`❌ **${label}** logging is not configured.\n\nUse \`/logging setup\` to enable it.`);
    return;
  }

  const channelMention = `<#${catConfig.channelId}>`;

  const subcatList = catConfig.subcategories
    ? Array.from(catConfig.subcategories.entries())
        .map(([key, enabled]: [string, boolean]) => {
          const emoji = enabled ? "✅" : "❌";
          const formatted = key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
          return `${emoji} ${formatted}`;
        })
        .join("\n")
    : "*None*";

  const label = categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1);
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${label} Logging Configuration`)
    .addFields(
      { name: "Channel", value: channelMention, inline: true },
      { name: "Status", value: catConfig.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Subcategories", value: subcatList || "*None*", inline: false },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
