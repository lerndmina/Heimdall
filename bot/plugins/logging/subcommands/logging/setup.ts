/**
 * /logging setup — Configure logging for a category
 */

import { ChannelType, TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LoggingPluginAPI } from "../../index.js";
import { LoggingCategory } from "../../models/LoggingConfig.js";

export async function handleSetup(context: CommandContext, pluginAPI: LoggingPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const categoryStr = interaction.options.getString("category", true);
  const channel = interaction.options.getChannel("channel", true);

  if (channel.type !== ChannelType.GuildText) {
    await interaction.editReply("❌ The channel must be a text channel.");
    return;
  }

  const category = categoryStr as LoggingCategory;
  if (!Object.values(LoggingCategory).includes(category)) {
    await interaction.editReply("❌ Invalid category specified.");
    return;
  }

  const result = await pluginAPI.loggingService.setupCategory(interaction.guildId!, category, channel.id);

  if (!result.success) {
    await interaction.editReply(`❌ Failed to setup logging: ${result.error}`);
    return;
  }

  // Send test embed to the logging channel
  try {
    const trackedEvents: Record<string, string> = {
      [LoggingCategory.MESSAGES]: "• Message Edits\n• Message Deletions\n• Bulk Deletions",
      [LoggingCategory.USERS]: "• Profile Updates (username, avatar, banner)\n• Member Updates (nickname, roles, timeouts)",
      [LoggingCategory.MODERATION]: "• Bans\n• Unbans\n• Timeouts",
    };

    const categoryNames: Record<string, string> = {
      [LoggingCategory.MESSAGES]: "Message Logging",
      [LoggingCategory.USERS]: "User Logging",
      [LoggingCategory.MODERATION]: "Moderation Logging",
    };

    const testEmbed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`✅ ${categoryNames[category]} Enabled`)
      .setDescription(`Logs for this category will be sent to this channel.\n\n**Tracked Events:**\n${trackedEvents[category]}\n\nUse \`/logging toggle\` to customize specific subcategories.`)
      .setFooter({ text: `Setup by ${interaction.user.tag}` })
      .setTimestamp();

    await (channel as unknown as TextChannel).send({ embeds: [testEmbed] });
  } catch {
    // Non-critical — test message failed but config saved
  }

  const label = categoryStr.charAt(0).toUpperCase() + categoryStr.slice(1);
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Logging Configured")
    .setDescription(`**${label}** logging has been setup successfully.\nLogs will be sent to ${channel}.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
