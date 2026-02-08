/**
 * messageReactionAdd → Automod reaction handler
 *
 * Delegates to AutomodEnforcer.handleReaction() for emoji rule evaluation.
 */

import { Events, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.MessageReactionAdd;
export const pluginName = "moderation";

export async function execute(client: HeimdallClient, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  // Ignore bots
  if (user.bot) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod) return;

  await mod.automodEnforcer.handleReaction(reaction, user);
}
