/**
 * /suggestion-config view-config — View full suggestion system configuration
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:view-config");

export async function handleViewConfig(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

    if (!guildConfig) {
      await interaction.editReply("No suggestion configuration exists for this server yet.\n\nUse `/suggestion-config add-channel` to get started!");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor("Blue")
      .setTitle("⚙️ Suggestion System Configuration")
      .setDescription(`Configuration for ${interaction.guild?.name}`)
      .addFields(
        { name: "Channels", value: `${guildConfig.channels.length}/${guildConfig.maxChannels} configured`, inline: true },
        { name: "Vote Cooldown", value: `${guildConfig.voteCooldown} seconds`, inline: true },
        { name: "Submission Cooldown", value: `${guildConfig.submissionCooldown} seconds`, inline: true },
        { name: "Categories", value: guildConfig.enableCategories ? "Enabled" : "Disabled", inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Last updated by ${guildConfig.updatedBy}` });

    if (guildConfig.channels.length > 0) {
      const channelList = guildConfig.channels.map((ch) => `• <#${ch.channelId}> - ${ch.mode} mode${ch.enableAiTitles ? " (AI titles)" : ""}`).join("\n");

      embed.addFields({ name: "Configured Channels", value: channelList, inline: false });
    }

    if (guildConfig.categories.length > 0) {
      const categoryList = guildConfig.categories
        .sort((a, b) => a.position - b.position)
        .map((cat) => `• ${cat.emoji || "📁"} ${cat.name} ${cat.isActive ? "" : "(disabled)"}`)
        .join("\n");

      embed.addFields({ name: `Categories (${guildConfig.categories.length}/${guildConfig.maxCategories})`, value: categoryList, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    log.error("Error viewing suggestion config:", error);
    await interaction.editReply("❌ An error occurred while loading configuration. Please try again later.");
  }
}
