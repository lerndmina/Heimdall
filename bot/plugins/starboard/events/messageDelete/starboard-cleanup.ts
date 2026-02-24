import { Events, type Message, type PartialMessage } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { StarboardPluginAPI } from "../../index.js";

export const event = Events.MessageDelete;
export const pluginName = "starboard";

export async function execute(client: HeimdallClient, message: Message | PartialMessage): Promise<void> {
  if (!message.guildId) return;

  const starboard = client.plugins.get("starboard") as StarboardPluginAPI | undefined;
  if (!starboard) return;

  await starboard.starboardService.handleAnyMessageDelete(message.guildId, message.id);
}
