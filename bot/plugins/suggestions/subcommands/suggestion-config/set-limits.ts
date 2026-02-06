/**
 * /suggestion-config set-limits — Configure suggestion system limits
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import SuggestionConfig from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:set-limits");

export async function handleSetLimits(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const maxChannels = interaction.options.getInteger("max-channels");
    const voteCooldown = interaction.options.getInteger("vote-cooldown");
    const submissionCooldown = interaction.options.getInteger("submission-cooldown");

    if (!maxChannels && !voteCooldown && !submissionCooldown) {
      await interaction.editReply("❌ Please specify at least one limit to update.");
      return;
    }

    let guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

    if (!guildConfig) {
      guildConfig = await SuggestionConfig.create({
        guildId: interaction.guildId!,
        channels: [],
        maxChannels: maxChannels || 3,
        voteCooldown: voteCooldown || 60,
        submissionCooldown: submissionCooldown || 3600,
        updatedBy: interaction.user.id,
      });
    } else {
      const updateData: Record<string, unknown> = { updatedBy: interaction.user.id };
      if (maxChannels !== null) updateData.maxChannels = maxChannels;
      if (voteCooldown !== null) updateData.voteCooldown = voteCooldown;
      if (submissionCooldown !== null) updateData.submissionCooldown = submissionCooldown;

      guildConfig = await SuggestionConfig.findOneAndUpdate({ guildId: interaction.guildId! }, updateData, { new: true });

      if (!guildConfig) {
        await interaction.editReply("❌ Failed to update configuration.");
        return;
      }
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor("Green")
      .setTitle("✅ Limits Updated")
      .setDescription("Suggestion system limits have been updated.")
      .addFields(
        { name: "Max Channels", value: guildConfig.maxChannels.toString(), inline: true },
        { name: "Vote Cooldown", value: `${guildConfig.voteCooldown}s`, inline: true },
        { name: "Submission Cooldown", value: `${guildConfig.submissionCooldown}s`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    log.info(`Updated suggestion limits for guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error setting suggestion limits:", error);
    await interaction.editReply("❌ An error occurred while updating limits. Please try again later.");
  }
}
