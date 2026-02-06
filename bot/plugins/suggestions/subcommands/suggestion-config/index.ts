/**
 * /suggestion-config subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { handleAddChannel } from "./add-channel.js";
import { handleRemoveChannel } from "./remove-channel.js";
import { handleListChannels } from "./list-channels.js";
import { handleSetLimits } from "./set-limits.js";
import { handleViewConfig } from "./view-config.js";
import { handleCreateOpener } from "./create-opener.js";
import { handleRemoveOpener } from "./remove-opener.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const pluginAPI = getPluginAPI<SuggestionsPluginAPI>("suggestions");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Suggestions plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "add-channel":
      await handleAddChannel(context, pluginAPI);
      break;
    case "remove-channel":
      await handleRemoveChannel(context, pluginAPI);
      break;
    case "list-channels":
      await handleListChannels(context, pluginAPI);
      break;
    case "set-limits":
      await handleSetLimits(context, pluginAPI);
      break;
    case "view-config":
      await handleViewConfig(context, pluginAPI);
      break;
    case "create-opener":
      await handleCreateOpener(context, pluginAPI);
      break;
    case "remove-opener":
      await handleRemoveOpener(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
