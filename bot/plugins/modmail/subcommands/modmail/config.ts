/**
 * /modmail config - Launch interactive configuration panel
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailConfigPanel } from "../../utils/ModmailConfigPanel.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:config");

export async function handleConfig(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const panel = new ModmailConfigPanel(context.interaction, pluginAPI, log);
  await panel.launch();
}
