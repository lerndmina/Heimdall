/**
 * messageCreate event — Detect voice messages and handle auto/reactions mode
 *
 * - AUTO mode: Immediately transcribes voice messages that pass filters
 * - REACTIONS mode: Adds ✍️ and ❌ reactions for manual transcription
 */

import { Events, type Message, MessageFlags, ThreadChannel, ChannelType } from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import VoiceTranscriptionConfig from "../models/VoiceTranscriptionConfig.js";
import { TranscriptionMode } from "../types/index.js";
import { transcribeMessage } from "../utils/TranscribeMessage.js";
import { passesFilters } from "../utils/FilterUtils.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { VCTranscriptionPluginAPI } from "../index.js";

const log = createLogger("vc-transcription");

export const event = Events.MessageCreate;
export const pluginName = "vc-transcription";

/**
 * Check if a message is a Discord voice message.
 */
function isVoiceMessage(message: Message): boolean {
  return (
    message.flags.has(MessageFlags.IsVoiceMessage) &&
    message.attachments.size === 1
  );
}

export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (message.channel.type === ChannelType.DM) return;
  if (!message.guildId) return;

  // Only process voice messages
  if (!isVoiceMessage(message)) return;

  // Don't process in threads (to avoid double-processing)
  if (message.channel instanceof ThreadChannel) return;

  try {
    const config = await VoiceTranscriptionConfig.findOne({ guildId: message.guildId });
    const mode = (config?.mode as TranscriptionMode) || TranscriptionMode.DISABLED;

    if (mode === TranscriptionMode.DISABLED) return;

    // Check filters
    if (config && !passesFilters(message, config)) {
      log.debug(`Voice message from ${message.author.username} filtered out`);
      return;
    }

    if (mode === TranscriptionMode.REACTIONS) {
      // Add reaction buttons for manual transcription
      if (message.reactions.cache.size > 0) return;
      try {
        await message.react("✍️");
        await message.react("❌");
      } catch (error) {
        log.error("Failed to add transcription reactions:", error);
      }
    } else if (mode === TranscriptionMode.AUTO) {
      log.debug(`Auto-transcribing voice message from ${message.author.username}`);

      const pluginApi = client.plugins.get("vc-transcription") as VCTranscriptionPluginAPI | undefined;
      if (!pluginApi?.guildEnvService) {
        log.error("VC Transcription plugin API not available");
        return;
      }

      await transcribeMessage(client, message, {
        provider: config?.whisperProvider || "local",
        model: config?.whisperModel || "base.en",
        guildId: message.guildId,
        guildEnvService: pluginApi.guildEnvService,
      });
    }
  } catch (error) {
    log.error("Error handling voice message:", error);
  }
}
