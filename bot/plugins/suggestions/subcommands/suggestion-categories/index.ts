/**
 * /suggestion-categories subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { handleList } from "./list.js";
import { handleAdd } from "./add.js";
import { handleRemove } from "./remove.js";
import { handleEdit } from "./edit.js";
import { handleToggle } from "./toggle.js";
import { handleReorder } from "./reorder.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const pluginAPI = getPluginAPI<SuggestionsPluginAPI>("suggestions");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Suggestions plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "list":
      await handleList(context, pluginAPI);
      break;
    case "add":
      await handleAdd(context, pluginAPI);
      break;
    case "remove":
      await handleRemove(context, pluginAPI);
      break;
    case "edit":
      await handleEdit(context, pluginAPI);
      break;
    case "toggle":
      await handleToggle(context, pluginAPI);
      break;
    case "reorder":
      await handleReorder(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
