/**
 * /welcome subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";
import { handleSetup } from "./setup.js";
import { handleRemove } from "./remove.js";
import { handleView } from "./view.js";
import { handleTest } from "./test.js";
import { handleVariables } from "./variables.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const subcommand = interaction.options.getSubcommand();

  const pluginAPI = getPluginAPI<WelcomePluginAPI>("welcome");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Welcome plugin not loaded.", ephemeral: true });
    return;
  }

  switch (subcommand) {
    case "setup":
      await handleSetup(context, pluginAPI);
      break;
    case "remove":
      await handleRemove(context, pluginAPI);
      break;
    case "view":
      await handleView(context, pluginAPI);
      break;
    case "test":
      await handleTest(context, pluginAPI);
      break;
    case "variables":
      await handleVariables(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
