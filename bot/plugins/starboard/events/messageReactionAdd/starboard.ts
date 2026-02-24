import { Events, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { StarboardPluginAPI } from "../../index.js";

export const event = Events.MessageReactionAdd;
export const pluginName = "starboard";

export async function execute(client: HeimdallClient, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  if (user.bot) return;

  try {
    if (reaction.partial) {
      reaction = await reaction.fetch();
    }
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
  } catch {
    return;
  }

  const starboard = client.plugins.get("starboard") as StarboardPluginAPI | undefined;
  if (!starboard) return;

  await starboard.starboardService.handleReactionAdd(reaction, user);
}
