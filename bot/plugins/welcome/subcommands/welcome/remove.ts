/**
 * /welcome remove — Delete the welcome message configuration
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";

export async function handleRemove(context: CommandContext, pluginAPI: WelcomePluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;

  try {
    const result = await pluginAPI.welcomeService.deleteConfig(guildId);

    if (!result.deleted) {
      await interaction.editReply("⚠️ No welcome message configuration found for this server.");
      return;
    }

    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Welcome Message Removed").setDescription("Welcome messages have been disabled for this server.");

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply("❌ Failed to remove welcome message configuration. Please try again.");
  }
}
