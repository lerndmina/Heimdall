/**
 * MessageDelete event — Log deleted messages
 */

import { Events, type Message, type PartialMessage } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.MessageDelete;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, message: Message | PartialMessage): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleMessageDelete(message);
}
