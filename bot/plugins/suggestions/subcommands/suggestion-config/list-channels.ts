/**
 * /suggestion-config list-channels — List all configured suggestion channels
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:list-channels");

export async function handleListChannels(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

    if (!guildConfig || guildConfig.channels.length === 0) {
      await interaction.editReply("No suggestion channels are currently configured.");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor("Blue")
      .setTitle("📝 Configured Suggestion Channels")
      .setDescription(`${guildConfig.channels.length}/${guildConfig.maxChannels} channels configured`)
      .setTimestamp();

    for (const channel of guildConfig.channels) {
      embed.addFields({
        name: `<#${channel.channelId}>`,
        value: `**Mode:** ${channel.mode}\n**AI Titles:** ${channel.enableAiTitles ? "Enabled" : "Disabled"}\n**Added:** <t:${Math.floor(channel.createdAt.getTime() / 1000)}:R> by <@${channel.createdBy}>`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    log.error("Error listing suggestion channels:", error);
    await interaction.editReply("❌ An error occurred while listing channels. Please try again later.");
  }
}
