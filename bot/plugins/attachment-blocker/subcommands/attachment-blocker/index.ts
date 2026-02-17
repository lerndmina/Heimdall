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
import { handleBypassAdd } from "./bypass-add.js";
import { handleBypassRemove } from "./bypass-remove.js";
import { handleBypassList } from "./bypass-list.js";
import { handleBypassChannelAdd } from "./bypass-channel-add.js";
import { handleBypassChannelRemove } from "./bypass-channel-remove.js";
import { handleBypassChannelList } from "./bypass-channel-list.js";

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

  if (subcommandGroup === "bypass") {
    switch (subcommand) {
      case "add":
        await handleBypassAdd(context, pluginAPI);
        break;
      case "remove":
        await handleBypassRemove(context, pluginAPI);
        break;
      case "list":
        await handleBypassList(context, pluginAPI);
        break;
      case "channel-add":
        await handleBypassChannelAdd(context, pluginAPI);
        break;
      case "channel-remove":
        await handleBypassChannelRemove(context, pluginAPI);
        break;
      case "channel-list":
        await handleBypassChannelList(context, pluginAPI);
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
