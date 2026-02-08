/**
 * messageCreate event — Check and enforce attachment blocking rules.
 */

import { Events, ChannelType, type Message } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export const event = Events.MessageCreate;
export const pluginName = "attachment-blocker";

export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Skip bots and DMs
  if (message.author.bot) return;
  if (message.channel.type === ChannelType.DM) return;

  const pluginAPI = client.plugins.get("attachment-blocker") as AttachmentBlockerPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.service.checkAndEnforce(message);
}
