/**
 * /suggestion-config remove-channel — Remove a suggestion channel
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import Suggestion from "../../models/Suggestion.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:remove-channel");

export async function handleRemoveChannel(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  try {
    const channel = interaction.options.getChannel("channel", true);

    const existing = await SuggestionConfigHelper.getChannelConfig(channel.id);
    if (!existing) {
      await interaction.editReply(`❌ <#${channel.id}> is not configured for suggestions.`);
      return;
    }

    const success = await SuggestionConfigHelper.removeChannel(interaction.guildId!, channel.id);
    if (!success) {
      await interaction.editReply("❌ Failed to remove channel. Please try again later.");
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor("Orange")
      .setTitle("🗑️ Suggestion Channel Removed")
      .setDescription(`<#${channel.id}> has been removed from the suggestion system.`)
      .addFields({
        name: "Note",
        value: "Existing suggestions in this channel will remain, but new suggestions cannot be created here.",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    broadcastDashboardChange(interaction.guildId!, "suggestions", "config_updated", { requiredAction: "suggestions.manage_config" });
    log.info(`Removed suggestion channel ${channel.id} from guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error removing suggestion channel:", error);
    await interaction.editReply("❌ An error occurred while removing the channel. Please try again later.");
  }
}
