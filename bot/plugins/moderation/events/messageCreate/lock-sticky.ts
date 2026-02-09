/**
 * messageCreate → Sticky lock message handler
 *
 * When a message is sent in a locked channel (by a bypass role user),
 * re-sends the lock explanation embed so it always stays at the bottom.
 */

import { Events, type Message, type TextChannel, type NewsChannel } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModerationPluginAPI } from "../../index.js";

export const event = Events.MessageCreate;
export const pluginName = "moderation";

export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Ignore DMs
  if (!message.guild) return;

  // Ignore our own sticky messages to prevent infinite loops
  if (message.author.id === client.user?.id) return;

  const mod = client.plugins.get("moderation") as ModerationPluginAPI | undefined;
  if (!mod?.channelLockService) return;

  // Quick check — is this channel locked?
  const isLocked = await mod.channelLockService.isLocked(message.channel.id);
  if (!isLocked) return;

  // Refresh the sticky message (delete old, send new at bottom)
  await mod.channelLockService.refreshStickyMessage(message.channel as TextChannel | NewsChannel);
}
