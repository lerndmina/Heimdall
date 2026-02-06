/**
 * /welcome setup — Configure the welcome message channel and template
 */

import { ChannelType, type GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";

export async function handleSetup(context: CommandContext, pluginAPI: WelcomePluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);
  const message = interaction.options.getString("message", true);
  const guildId = interaction.guildId!;

  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply("❌ The specified channel must be a text channel.");
    return;
  }

  try {
    await pluginAPI.welcomeService.upsertConfig(guildId, channel.id, message);

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Welcome Message Configured")
      .setDescription("Welcome messages are now enabled!")
      .addFields({ name: "Channel", value: `<#${channel.id}>`, inline: true }, { name: "Message Preview", value: message.substring(0, 1024), inline: false })
      .setFooter({ text: "Use /welcome test to preview how it will look" });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply("❌ Failed to configure welcome message. Please try again.");
  }
}
