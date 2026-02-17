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
import type { HeimdallClient } from "../../src/types/Client.js";
import { TranscriptionQueueService } from "./services/TranscriptionQueueService.js";

// Register model with Mongoose
import "./models/VoiceTranscriptionConfig.js";
import "./models/TranscriptionJob.js";

/** Public API exposed to other plugins and dashboard */
export interface VCTranscriptionPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  guildEnvService: GuildEnvService;
  queueService: TranscriptionQueueService;
}

/** Module-level reference for internal access */
let pluginAPI: VCTranscriptionPluginAPI | null = null;
export function getVCTranscriptionAPI(): VCTranscriptionPluginAPI | null {
  return pluginAPI;
}

export async function onLoad(context: PluginContext): Promise<VCTranscriptionPluginAPI> {
  const { logger, dependencies, guildEnvService, client } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("vc-transcription requires lib plugin");

  // Instantiate queue service
  const queueService = new TranscriptionQueueService(client as HeimdallClient, guildEnvService);

  logger.info("✅ VC Transcription plugin loaded");

  pluginAPI = {
    version: "1.0.0",
    lib,
    guildEnvService,
    queueService,
  };

  // Resume any queued/in-progress transcriptions left from a prior restart/crash.
  void queueService.resumePendingJobs().catch((error) => {
    logger.error("Failed to resume pending transcription jobs:", error);
  });

  return pluginAPI;
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  if (pluginAPI?.queueService) {
    pluginAPI.queueService.stop();
  }
  pluginAPI = null;
  logger.info("🛑 VC Transcription plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
