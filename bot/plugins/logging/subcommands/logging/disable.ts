/**
 * /logging disable — Disable logging for a category or all categories
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LoggingPluginAPI } from "../../index.js";
import { LoggingCategory } from "../../models/LoggingConfig.js";

export async function handleDisable(context: CommandContext, pluginAPI: LoggingPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const categoryStr = interaction.options.getString("category", true);
  const guildId = interaction.guildId!;

  // Disable all
  if (categoryStr === "all") {
    const result = await pluginAPI.loggingService.toggleGlobal(guildId, false);

    if (!result.success) {
      await interaction.editReply(`❌ Failed to disable logging: ${result.error}`);
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle("🔇 All Logging Disabled")
      .setDescription("All logging categories have been disabled for this server.\n\nUse `/logging setup` to re-enable specific categories.")
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Disable specific category
  const category = categoryStr as LoggingCategory;
  if (!Object.values(LoggingCategory).includes(category)) {
    await interaction.editReply("❌ Invalid category specified.");
    return;
  }

  const result = await pluginAPI.loggingService.disableCategory(guildId, category);

  if (!result.success) {
    await interaction.editReply(`❌ ${result.error || "Failed to disable logging"}`);
    return;
  }

  const label = categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1);
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle("🔇 Logging Disabled")
    .setDescription(`**${label}** logging has been disabled.\n\nUse \`/logging setup\` to re-enable it.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
