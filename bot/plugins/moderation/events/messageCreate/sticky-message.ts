/**
 * messageCreate → Sticky message handler
 *
 * When a message is sent in a channel with an active sticky,
 * refresh the sticky so it stays at the bottom.
 */

import { Events, type Message, type TextChannel, type NewsChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.MessageCreate;
export const pluginName = "moderation";

export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Ignore DMs
  if (!message.guild) return;

  // Ignore our own messages to prevent infinite loops
  if (message.author.id === client.user?.id) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod?.stickyMessageService) return;

  // Quick check — does this channel have an active sticky?
  const hasSticky = await mod.stickyMessageService.hasSticky(message.channel.id);
  if (!hasSticky) return;

  // Refresh the sticky message (delete old, send new at bottom)
  await mod.stickyMessageService.handleNewMessage(message.channel as TextChannel | NewsChannel);
}
