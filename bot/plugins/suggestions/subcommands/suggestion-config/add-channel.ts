/**
 * /suggestion-config add-channel — Add a channel for suggestions
 */

import { ChannelType } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { hasAICapabilities } from "../../utils/AIHelper.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:add-channel");

export async function handleAddChannel(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.options.getChannel("channel", true);
    const useAiTitles = interaction.options.getBoolean("use-ai-titles") || false;

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) {
      await interaction.editReply("Invalid channel type. Please select a text channel or forum channel.");
      return;
    }

    const mode = channel.type === ChannelType.GuildForum ? "forum" : "embed";

    if (useAiTitles) {
      const hasAI = await hasAICapabilities(interaction.guildId!, pluginAPI.guildEnvService);
      if (!hasAI) {
        await interaction.editReply("❌ AI title generation requires an OpenAI API key to be configured.\n\nPlease configure it using `/dev guild-env set` or disable AI titles for this channel.");
        return;
      }
    }

    const existing = await SuggestionConfigHelper.getChannelConfig(channel.id);
    if (existing) {
      await interaction.editReply(`❌ <#${channel.id}> is already configured for suggestions.`);
      return;
    }

    const capacityCheck = await SuggestionConfigHelper.isAtMaxCapacity(interaction.guildId!);
    if (capacityCheck) {
      const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);
      await interaction.editReply(`❌ Maximum suggestion channels reached (${guildConfig?.channels.length}/${guildConfig?.maxChannels}).\n\nRemove a channel before adding a new one.`);
      return;
    }

    const result = await SuggestionConfigHelper.addChannel(interaction.guildId!, channel.id, mode, useAiTitles, interaction.user.id);

    if (!result) {
      await interaction.editReply("❌ Failed to add channel. Please try again later.");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor("Green")
      .setTitle("✅ Suggestion Channel Added")
      .setDescription(`<#${channel.id}> has been configured for suggestions!`)
      .addFields(
        { name: "Mode", value: mode, inline: true },
        { name: "AI Titles", value: useAiTitles ? "Enabled" : "Disabled", inline: true },
        { name: "Configured By", value: `<@${interaction.user.id}>`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    log.info(`Added suggestion channel ${channel.id} in guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error adding suggestion channel:", error);
    await interaction.editReply("❌ An error occurred while adding the channel. Please try again later.");
  }
}
