/**
 * VC Transcription Plugin — Voice message transcription using local Whisper or OpenAI API
 *
 * Provides:
 * - /voice-transcription command for mode selection
 * - Auto/reactions-based voice message transcription
 * - Per-guild encrypted OpenAI API key storage
 * - Role and channel whitelist/blacklist filters
 * - Dashboard API routes for full configuration
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { GuildEnvService } from "../../src/core/services/GuildEnvService.js";

// Register model with Mongoose
import "./models/VoiceTranscriptionConfig.js";

/** Public API exposed to other plugins and dashboard */
export interface VCTranscriptionPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  guildEnvService: GuildEnvService;
}

export async function onLoad(context: PluginContext): Promise<VCTranscriptionPluginAPI> {
  const { logger, dependencies, guildEnvService } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("vc-transcription requires lib plugin");

  logger.info("✅ VC Transcription plugin loaded");

  return {
    version: "1.0.0",
    lib,
    guildEnvService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 VC Transcription plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
