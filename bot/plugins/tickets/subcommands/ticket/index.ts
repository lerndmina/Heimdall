/**
 * /ticket subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { handleOpen } from "./open.js";
import { handleClose } from "./close.js";
import { handleClaim } from "./claim.js";
import { handleUnclaim } from "./unclaim.js";
import { handleRename } from "./rename.js";
import { handleMove } from "./move.js";
import { handleList } from "./list.js";
import { handleKeepOpen } from "./keepopen.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "open":
      await handleOpen(context);
      break;
    case "close":
      await handleClose(context);
      break;
    case "claim":
      await handleClaim(context);
      break;
    case "unclaim":
      await handleUnclaim(context);
      break;
    case "rename":
      await handleRename(context);
      break;
    case "move":
      await handleMove(context);
      break;
    case "list":
      await handleList(context);
      break;
    case "keepopen":
      await handleKeepOpen(context);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
