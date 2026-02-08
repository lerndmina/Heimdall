/**
 * /purge subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { handleCount } from "./count.js";
import { handleTime } from "./time.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "count":
      await handleCount(context);
      break;
    case "time":
      await handleTime(context);
      break;
    default:
      await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
  }
}
