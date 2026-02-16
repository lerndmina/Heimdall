/**
 * messageReactionAdd event — Handle ✍️ reaction for on-demand transcription
 *
 * When a user reacts with ✍️ to a voice message in reactions mode,
 * this transcribes the message and removes the reaction options.
 * Reacting with ❌ removes the reactions without transcribing.
 */

import { Events, type MessageReaction, type PartialMessageReaction, type User, type PartialUser, MessageFlags } from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import VoiceTranscriptionConfig from "../models/VoiceTranscriptionConfig.js";
import { TranscriptionMode, WhisperProvider } from "../types/index.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { VCTranscriptionPluginAPI } from "../index.js";

const log = createLogger("vc-transcription");

export const event = Events.MessageReactionAdd;
export const pluginName = "vc-transcription";

function isVoiceMessage(message: import("discord.js").Message): boolean {
  return message.flags.has(MessageFlags.IsVoiceMessage) && message.attachments.size === 1;
}

export async function execute(client: HeimdallClient, reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  if (user.bot) return;

  // Fetch partials if needed
  try {
    if (reaction.partial) {
      reaction = await reaction.fetch();
    }
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
  } catch (error) {
    log.error("Failed to fetch partial reaction/message:", error);
    return;
  }

  const message = reaction.message;

  // Only process voice messages
  if (!isVoiceMessage(message as import("discord.js").Message)) return;
  if (!message.guildId) return;

  // Check guild config
  try {
    const config = await VoiceTranscriptionConfig.findOne({ guildId: message.guildId });
    const mode = (config?.mode as TranscriptionMode) || TranscriptionMode.DISABLED;

    if (mode !== TranscriptionMode.REACTIONS) {
      log.debug(`Ignoring reaction — guild mode is ${mode}, not reactions`);
      return;
    }

    const emoji = reaction.emoji.name;

    if (emoji === "✍️") {
      log.info(`Transcription requested by ${user.username ?? user.id} for voice message from ${message.author?.username ?? "unknown"}`);

      const pluginApi = client.plugins.get("vc-transcription") as VCTranscriptionPluginAPI | undefined;
      if (!pluginApi?.guildEnvService || !pluginApi?.queueService) {
        log.error("VC Transcription plugin API not available");
        return;
      }

      // Remove reactions immediately (don't wait for transcription)
      try {
        await message.reactions.removeAll();
      } catch (error) {
        log.error("Failed to remove reactions:", error);
      }

      await pluginApi.queueService.enqueue(message as import("discord.js").Message, {
        provider: (config?.whisperProvider as WhisperProvider) || WhisperProvider.LOCAL,
        model: config?.whisperModel || "base.en",
        guildId: message.guildId,
        guildEnvService: pluginApi.guildEnvService,
      });
    }

    if (emoji === "❌") {
      log.debug(`Transcription dismissed by ${user.username ?? user.id}`);
      try {
        await message.reactions.removeAll();
      } catch (error) {
        log.error("Failed to remove reactions:", error);
      }
    }
  } catch (error) {
    log.error("Error handling transcription reaction:", error);
  }
}
