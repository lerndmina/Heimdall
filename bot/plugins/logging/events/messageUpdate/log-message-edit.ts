/**
 * MessageUpdate event — Log edited messages
 */

import { Events, type Message, type PartialMessage } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.MessageUpdate;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleMessageUpdate(oldMessage, newMessage);
}
