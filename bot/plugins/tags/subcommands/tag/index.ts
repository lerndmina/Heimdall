/**
 * /tag subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../../index.js";
import { handleUse } from "./use.js";
import { handleCreate } from "./create.js";
import { handleEdit } from "./edit.js";
import { handleDelete } from "./delete.js";
import { handleList } from "./list.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const pluginAPI = getPluginAPI<TagsPluginAPI>("tags");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Tags plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "use":
      await handleUse(context, pluginAPI);
      break;
    case "create":
      await handleCreate(context, pluginAPI);
      break;
    case "edit":
      await handleEdit(context, pluginAPI);
      break;
    case "delete":
      await handleDelete(context, pluginAPI);
      break;
    case "list":
      await handleList(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
