/**
 * /automod subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";
import { handleEnable } from "./enable.js";
import { handleDisable } from "./disable.js";
import { handleView } from "./view.js";
import { handleStats } from "./stats.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "enable":
      await handleEnable(context);
      break;
    case "disable":
      await handleDisable(context);
      break;
    case "view":
      await handleView(context);
      break;
    case "stats":
      await handleStats(context);
      break;
    default:
      await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
  }
}
