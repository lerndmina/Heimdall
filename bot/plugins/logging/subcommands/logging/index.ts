/**
 * /logging subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LoggingPluginAPI } from "../../index.js";
import { handleSetup } from "./setup.js";
import { handleDisable } from "./disable.js";
import { handleView } from "./view.js";
import { handleToggle } from "./toggle.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const pluginAPI = getPluginAPI<LoggingPluginAPI>("logging");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Logging plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "setup":
      await handleSetup(context, pluginAPI);
      break;
    case "disable":
      await handleDisable(context, pluginAPI);
      break;
    case "view":
      await handleView(context, pluginAPI);
      break;
    case "toggle":
      await handleToggle(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
