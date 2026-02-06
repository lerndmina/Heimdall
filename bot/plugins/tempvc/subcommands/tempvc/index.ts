/**
 * /tempvc subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { handleCreate } from "./create.js";
import { handleDelete } from "./delete.js";
import { handleDeleteAll } from "./delete-all.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "create":
      await handleCreate(context);
      break;
    case "delete":
      await handleDelete(context);
      break;
    case "delete-all":
      await handleDeleteAll(context);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
