/**
 * messageCreate → Automod message handler
 *
 * Delegates to AutomodEnforcer.handleMessage() for regex rule evaluation.
 */

import { Events, type Message } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.MessageCreate;
export const pluginName = "moderation";

export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod) return;

  await mod.automodEnforcer.handleMessage(message);
}
