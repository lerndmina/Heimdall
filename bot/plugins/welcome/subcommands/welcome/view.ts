/**
 * /welcome view — Display the current welcome message configuration
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";

export async function handleView(context: CommandContext, pluginAPI: WelcomePluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;

  try {
    const config = await pluginAPI.welcomeService.getConfig(guildId);

    if (!config) {
      await interaction.editReply("⚠️ No welcome message configured for this server.\n\nUse `/welcome setup` to configure one.");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📋 Welcome Message Configuration")
      .addFields(
        { name: "Channel", value: `<#${config.channelId}>`, inline: true },
        { name: "Configured", value: `<t:${Math.floor(config.createdAt.getTime() / 1000)}:R>`, inline: true },
        { name: "Message", value: config.message.substring(0, 1024), inline: false },
      )
      .setFooter({ text: "Use /welcome test to preview the message" });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply("❌ Failed to retrieve welcome message configuration. Please try again.");
  }
}
