/**
 * Thread Handler - Process staff messages in modmail forum threads
 *
 * Handles:
 * - Detecting messages in modmail threads
 * - Staff-only prefix (`.` at start = don't relay, react 🕵️)
 * - Relaying staff messages to user DM
 * - Updating thread activity timestamp
 */

import { Events, Message } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import Modmail, { ModmailStatus } from "../../models/Modmail.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:thread-handler");

export const event = Events.MessageCreate;
export const pluginName = "modmail";

/**
 * Main event handler
 */
export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Only process messages in threads
  if (!message.channel.isThread()) return;

  // Skip bot messages
  if (message.author.bot) return;

  // Skip empty messages
  if (!message.content.trim() && message.attachments.size === 0) return;

  const pluginAPI = getPluginAPI(client);
  if (!pluginAPI) {
    log.debug("Modmail plugin API not available");
    return;
  }

  try {
    // Check if this thread is a modmail thread
    const modmail = await Modmail.findOne({
      forumThreadId: message.channel.id,
      status: { $ne: ModmailStatus.CLOSED },
    });

    if (!modmail) {
      // Not a modmail thread, skip silently
      return;
    }

    const modmailId = modmail.modmailId as string;

    // Check for staff-only prefix (message starts with `.`)
    if (message.content.trimStart().startsWith(".")) {
      // Staff-only message - don't relay, react with spy emoji
      try {
        await message.react("🕵️");
      } catch {
        // Ignore reaction failures
      }

      log.debug(`Staff-only message in modmail ${modmailId}`);
      return;
    }

    // Relay message to user
    const success = await pluginAPI.flowService.relayThreadMessageToUser(modmailId, message, message.author);

    if (success) {
      log.debug(`Relayed staff message to user for modmail ${modmailId}`);
    } else {
      // The flowService already handles error reactions/replies
      log.warn(`Failed to relay staff message for modmail ${modmailId}`);
    }
  } catch (error) {
    log.error(`Error handling thread message in ${message.channel.id}:`, error);
  }
}
