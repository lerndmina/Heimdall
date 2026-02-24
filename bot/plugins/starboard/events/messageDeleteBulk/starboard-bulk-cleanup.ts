import { Events, type Collection, type Message, type Snowflake } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { StarboardPluginAPI } from "../../index.js";

export const event = Events.MessageBulkDelete;
export const pluginName = "starboard";

export async function execute(client: HeimdallClient, messages: Collection<Snowflake, Message>): Promise<void> {
  const starboard = client.plugins.get("starboard") as StarboardPluginAPI | undefined;
  if (!starboard) return;

  for (const message of messages.values()) {
    if (!message.guildId) continue;
    await starboard.starboardService.handleAnyMessageDelete(message.guildId, message.id);
  }
}
