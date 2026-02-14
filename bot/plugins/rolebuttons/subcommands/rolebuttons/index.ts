import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";
import { handleCreate } from "./create.ts";
import { handleEdit } from "./edit.ts";
import { handlePost } from "./post.ts";
import { handleUpdate } from "./update.ts";
import { handleDelete } from "./delete.ts";
import { handleList } from "./list.ts";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const api = getPluginAPI<RoleButtonsPluginAPI>("rolebuttons");
  if (!api) {
    await interaction.reply({ content: "❌ Role Buttons plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "create":
      await handleCreate(context, api);
      break;
    case "edit":
      await handleEdit(context, api);
      break;
    case "post":
      await handlePost(context, api);
      break;
    case "update":
      await handleUpdate(context, api);
      break;
    case "delete":
      await handleDelete(context, api);
      break;
    case "list":
      await handleList(context, api);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
