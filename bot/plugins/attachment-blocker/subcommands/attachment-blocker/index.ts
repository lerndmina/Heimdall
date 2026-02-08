/**
 * /attachment-blocker subcommand router
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";
import { handleSetup } from "./setup.js";
import { handleChannelAdd } from "./channel-add.js";
import { handleChannelRemove } from "./channel-remove.js";
import { handleView } from "./view.js";
import { handleDisable } from "./disable.js";

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  const pluginAPI = getPluginAPI<AttachmentBlockerPluginAPI>("attachment-blocker");
  if (!pluginAPI) {
    await interaction.reply({ content: "❌ Attachment Blocker plugin not loaded.", ephemeral: true });
    return;
  }

  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  if (subcommandGroup === "channel") {
    switch (subcommand) {
      case "add":
        await handleChannelAdd(context, pluginAPI);
        break;
      case "remove":
        await handleChannelRemove(context, pluginAPI);
        break;
      default:
        await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
    }
    return;
  }

  switch (subcommand) {
    case "setup":
      await handleSetup(context, pluginAPI);
      break;
    case "view":
      await handleView(context, pluginAPI);
      break;
    case "disable":
      await handleDisable(context, pluginAPI);
      break;
    default:
      await interaction.reply({ content: "❌ Unknown subcommand.", ephemeral: true });
  }
}
