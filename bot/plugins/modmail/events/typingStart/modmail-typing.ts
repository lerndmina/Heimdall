/**
 * Modmail Typing Handler - Relays typing indicators from user DMs to modmail threads
 *
 * Features:
 * - Discord native typing indicator (sendTyping)
 * - Optional visual typing message with auto-deletion
 * - Rate limiting to prevent spam (3 seconds per user)
 * - Guild-level configuration for enabling/disabling
 */

import { Events, ChannelType, Typing } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../../index.js";
import Modmail, { ModmailStatus } from "../../models/Modmail.js";
import { TypingIndicatorStyle } from "../../models/ModmailConfig.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:typing");

export const event = Events.TypingStart;
export const pluginName = "modmail";

// Rate limiting cache: userId -> lastTypingTime
const typingRateLimit = new Map<string, number>();
const TYPING_RATE_LIMIT_MS = 3000; // 3 seconds

/**
 * Check if user is rate limited for typing events
 */
function isTypingRateLimited(userId: string): boolean {
  const now = Date.now();
  const lastTyping = typingRateLimit.get(userId);

  if (lastTyping && now - lastTyping < TYPING_RATE_LIMIT_MS) {
    return true;
  }

  typingRateLimit.set(userId, now);
  return false;
}

/**
 * Main event handler for typing start events
 */
export async function execute(client: HeimdallClient, typing: Typing): Promise<void> {
  // Only handle typing in DM channels
  if (!typing.channel || typing.channel.type !== ChannelType.DM) {
    return;
  }

  // Don't handle typing from bots
  if (typing.user?.bot) {
    return;
  }

  // Ensure we have a valid user ID
  if (!typing.user?.id) {
    return;
  }

  const userId = typing.user.id;

  // Check rate limit
  if (isTypingRateLimited(userId)) {
    return;
  }

  const pluginAPI = getPluginAPI(client);
  if (!pluginAPI) {
    log.debug("Modmail plugin API not available");
    return;
  }

  try {
    // Check if this user has an open modmail thread
    const modmail = await Modmail.findOne({
      userId,
      status: { $in: [ModmailStatus.OPEN, ModmailStatus.RESOLVED] },
    }).lean();

    if (!modmail) {
      return;
    }

    // Get guild config to check typing indicator settings
    const config = await pluginAPI.modmailService.getConfig(modmail.guildId as string);
    if (!config) {
      return;
    }

    // Check if typing indicators are enabled
    if ((config as any).typingIndicators === false) {
      return;
    }

    // Get typing indicator style (default to native)
    const typingStyle = ((config as any).typingIndicatorStyle as TypingIndicatorStyle) || TypingIndicatorStyle.NATIVE;

    // Get the modmail thread
    const thread = await pluginAPI.lib.thingGetter.getChannel(modmail.forumThreadId as string);
    if (!thread || (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread)) {
      log.debug(`Modmail thread ${modmail.forumThreadId} not found or not a thread`);
      return;
    }

    // Send typing indicators based on configuration
    if (typingStyle === TypingIndicatorStyle.NATIVE || typingStyle === TypingIndicatorStyle.BOTH) {
      try {
        await thread.sendTyping();
        log.debug(`Sent native typing indicator from ${typing.user.username} to thread ${thread.id}`);
      } catch (typingError) {
        log.debug("Failed to send native typing indicator:", typingError);
      }
    }

    if (typingStyle === TypingIndicatorStyle.MESSAGE || typingStyle === TypingIndicatorStyle.BOTH) {
      try {
        const displayName = typing.user.displayName || typing.user.username;

        const typingEmbed = pluginAPI.lib.createEmbedBuilder().setDescription(`💬 **${displayName}** is typing...`).setColor(0x5865f2).setTimestamp();

        const typingMessage = await thread.send({
          embeds: [typingEmbed],
        });

        // Auto-delete the typing message after 5 seconds
        setTimeout(async () => {
          try {
            await typingMessage.delete();
          } catch {
            // Message may already be deleted
          }
        }, 5000);

        log.debug(`Sent visual typing message from ${typing.user.username} to thread ${thread.id}`);
      } catch (messageError) {
        log.debug("Failed to send visual typing message:", messageError);
      }
    }
  } catch (error) {
    log.error(`Error handling typing event for user ${userId}:`, error);
  }
}
