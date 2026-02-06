/**
 * MessageBulkDelete event — Log bulk message deletions
 */

import { Events, type Message, type PartialMessage, type GuildTextBasedChannel, type ReadonlyCollection, type Snowflake } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { LoggingPluginAPI } from "../../index.js";

export const event = Events.MessageBulkDelete;
export const pluginName = "logging";

export async function execute(client: HeimdallClient, messages: ReadonlyCollection<Snowflake, Message | PartialMessage>, channel: GuildTextBasedChannel): Promise<void> {
  const pluginAPI = client.plugins.get("logging") as LoggingPluginAPI | undefined;
  if (!pluginAPI) return;

  await pluginAPI.eventService.handleMessageBulkDelete(messages, channel);
}
