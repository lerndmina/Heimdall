/**
 * /modmail subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { handleConfig } from "./config.js";
import { handleOpen } from "./open.js";
import { handleClose } from "./close.js";
import { handleResolve } from "./resolve.js";
import { handleBan } from "./ban.js";
import { handleUnban } from "./unban.js";
import { handleToggleAutoclose } from "./toggle-autoclose.js";
import { handleMigrate } from "./migrate.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  // Get plugin API for service access
  const pluginAPI = getPluginAPI<ModmailPluginAPI>("modmail");
  if (!pluginAPI) {
    await interaction.reply({
      content: "❌ Modmail plugin not loaded. Please contact the bot administrator.",
      ephemeral: true,
    });
    return;
  }

  // Route to subcommands
  switch (subcommand) {
    case "config":
      await handleConfig(context, pluginAPI);
      break;
    case "open":
      await handleOpen(context, pluginAPI);
      break;
    case "close":
      await handleClose(context, pluginAPI);
      break;
    case "resolve":
      await handleResolve(context, pluginAPI);
      break;
    case "ban":
      await handleBan(context, pluginAPI);
      break;
    case "unban":
      await handleUnban(context, pluginAPI);
      break;
    case "toggle-autoclose":
      await handleToggleAutoclose(context, pluginAPI);
      break;
    case "migrate":
      await handleMigrate(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
