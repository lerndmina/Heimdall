/**
 * /suggest subcommand router
 *
 * Since /suggest has no subcommands, this directly handles the command
 * by delegating to SuggestionService.handleOpenerSelection
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:suggest-cmd");

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  const pluginAPI = getPluginAPI<SuggestionsPluginAPI>("suggestions");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Suggestions plugin not loaded.", ephemeral: true });
    return;
  }

  try {
    const guildConfig = await SuggestionConfigHelper.getGuildConfig(interaction.guildId!);

    if (!guildConfig || guildConfig.channels.length === 0) {
      await interaction.reply({
        content: "❌ No suggestion channels are configured in this server. Please contact an administrator to set up suggestion channels using `/suggestion-config add-channel`.",
        ephemeral: true,
      });
      return;
    }

    // If only one channel, use it directly; otherwise show dropdown
    const channelConfig = guildConfig.channels[0]!;
    await pluginAPI.suggestionService.handleOpenerSelection(interaction, channelConfig.channelId);

    log.info(`User ${interaction.user.id} used suggest command in guild ${interaction.guildId}`);
  } catch (error) {
    log.error("Error in suggest command:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ There was an error setting up the suggestion form. Please try again later.",
        ephemeral: true,
      });
    }
  }
}
