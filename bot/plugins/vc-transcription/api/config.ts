/**
 * Config API routes for VC Transcription
 *
 * GET  /config        — Get guild transcription config
 * PUT  /config        — Update guild transcription config
 * DELETE /config      — Delete (reset) guild transcription config
 * GET  /model-status  — Get download status of all whisper models
 */

import { Router, type Request, type Response } from "express";
import VoiceTranscriptionConfig from "../models/VoiceTranscriptionConfig.js";
import { TranscriptionMode, WhisperProvider, FilterMode, LOCAL_WHISPER_MODELS, OPENAI_WHISPER_MODELS } from "../types/index.js";
import { isModelDownloaded, WHISPER_MODELS } from "../utils/TranscribeMessage.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { VCTranscriptionApiDependencies } from "./index.js";

const log = createLogger("vc-transcription");

export function createConfigRoutes(deps: VCTranscriptionApiDependencies): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /config — Get current transcription config for the guild
   */
  router.get("/config", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      const config = await VoiceTranscriptionConfig.findOne({ guildId });

      if (!config) {
        return res.json({
          success: true,
          data: {
            guildId,
            mode: TranscriptionMode.DISABLED,
            whisperProvider: WhisperProvider.LOCAL,
            whisperModel: "base.en",
            roleFilter: { mode: FilterMode.DISABLED, roles: [] },
            channelFilter: { mode: FilterMode.DISABLED, channels: [] },
            languageGate: { enabled: false, allowedLanguages: [] },
            translationEnabled: false,
            maxConcurrentTranscriptions: 1,
            maxQueueSize: 0,
            hasApiKey: false,
          },
        });
      }

      // Check if OpenAI API key is configured (without revealing it)
      let hasApiKey = false;
      try {
        hasApiKey = await deps.guildEnvService.hasEnv(guildId, "VC_TRANSCRIPTION_OPENAI_KEY");
      } catch {
        // GuildEnvService may not be available
      }

      return res.json({
        success: true,
        data: {
          guildId: config.guildId,
          mode: config.mode,
          whisperProvider: config.whisperProvider,
          whisperModel: config.whisperModel,
          roleFilter: config.roleFilter,
          channelFilter: config.channelFilter,
          languageGate: {
            enabled: config.languageGate?.enabled ?? false,
            allowedLanguages: config.languageGate?.allowedLanguages ?? [],
          },
          maxConcurrentTranscriptions: config.maxConcurrentTranscriptions ?? 1,
          maxQueueSize: config.maxQueueSize ?? 0,
          hasApiKey,
        },
      });
    } catch (error) {
      log.error("Failed to get transcription config:", error);
      return res.status(500).json({ success: false, error: { message: "Failed to fetch config" } });
    }
  });

  /**
   * PUT /config — Update transcription config
   */
  router.put("/config", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;
    const { mode, whisperProvider, whisperModel, roleFilter, channelFilter, languageGate, translationEnabled, maxConcurrentTranscriptions, maxQueueSize } = req.body;

    try {
      const update: Record<string, unknown> = {};

      // Validate and set mode
      if (mode !== undefined) {
        if (!Object.values(TranscriptionMode).includes(mode)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid mode. Must be one of: ${Object.values(TranscriptionMode).join(", ")}` },
          });
        }
        update.mode = mode;
      }

      // Validate and set provider
      if (whisperProvider !== undefined) {
        if (!Object.values(WhisperProvider).includes(whisperProvider)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid provider. Must be one of: ${Object.values(WhisperProvider).join(", ")}` },
          });
        }
        update.whisperProvider = whisperProvider;
      }

      // Validate model against the (new or existing) provider
      if (whisperModel !== undefined) {
        const effectiveProvider = (whisperProvider as WhisperProvider) || undefined;
        // Need to check against current config if provider isn't being updated
        let providerToCheck = effectiveProvider;
        if (!providerToCheck) {
          const existing = await VoiceTranscriptionConfig.findOne({ guildId });
          providerToCheck = existing?.whisperProvider || WhisperProvider.LOCAL;
        }

        const validModels = providerToCheck === WhisperProvider.OPENAI ? OPENAI_WHISPER_MODELS : LOCAL_WHISPER_MODELS;

        if (!(validModels as readonly string[]).includes(whisperModel)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid model for ${providerToCheck}. Must be one of: ${validModels.join(", ")}` },
          });
        }
        update.whisperModel = whisperModel;
      }

      // Validate role filter
      if (roleFilter !== undefined) {
        if (roleFilter.mode && !Object.values(FilterMode).includes(roleFilter.mode)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid role filter mode. Must be one of: ${Object.values(FilterMode).join(", ")}` },
          });
        }
        if (roleFilter.roles && !Array.isArray(roleFilter.roles)) {
          return res.status(400).json({
            success: false,
            error: { message: "roleFilter.roles must be an array of role IDs" },
          });
        }
        update.roleFilter = {
          mode: roleFilter.mode || FilterMode.DISABLED,
          roles: roleFilter.roles || [],
        };
      }

      // Validate channel filter
      if (channelFilter !== undefined) {
        if (channelFilter.mode && !Object.values(FilterMode).includes(channelFilter.mode)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid channel filter mode. Must be one of: ${Object.values(FilterMode).join(", ")}` },
          });
        }
        if (channelFilter.channels && !Array.isArray(channelFilter.channels)) {
          return res.status(400).json({
            success: false,
            error: { message: "channelFilter.channels must be an array of channel IDs" },
          });
        }
        update.channelFilter = {
          mode: channelFilter.mode || FilterMode.DISABLED,
          channels: channelFilter.channels || [],
        };
      }

      // Validate language gate
      if (languageGate !== undefined) {
        const enabled = Boolean(languageGate.enabled);
        const allowedLanguagesRaw = Array.isArray(languageGate.allowedLanguages) ? languageGate.allowedLanguages : [];
        const normalizedAllowed = allowedLanguagesRaw.map((lang: unknown) => String(lang).trim().toLowerCase()).filter((lang: string) => /^[a-z]{2,8}$/.test(lang));

        if (enabled && normalizedAllowed.length === 0) {
          return res.status(400).json({
            success: false,
            error: { message: "languageGate.allowedLanguages must include at least one language code when enabled" },
          });
        }

        update.languageGate = {
          enabled,
          allowedLanguages: normalizedAllowed,
        };
      }

      // Validate translation toggle
      if (translationEnabled !== undefined) {
        update.translationEnabled = Boolean(translationEnabled);
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: "No valid fields provided to update" },
        });
      }

      // Validate maxConcurrentTranscriptions
      if (maxConcurrentTranscriptions !== undefined) {
        const val = Number(maxConcurrentTranscriptions);
        if (!Number.isInteger(val) || val < 1 || val > 10) {
          return res.status(400).json({
            success: false,
            error: { message: "maxConcurrentTranscriptions must be an integer between 1 and 10" },
          });
        }
        update.maxConcurrentTranscriptions = val;
      }

      // Validate maxQueueSize
      if (maxQueueSize !== undefined) {
        const val = Number(maxQueueSize);
        if (!Number.isInteger(val) || val < 0) {
          return res.status(400).json({
            success: false,
            error: { message: "maxQueueSize must be a non-negative integer (0 = unlimited)" },
          });
        }
        update.maxQueueSize = val;
      }

      const config = await VoiceTranscriptionConfig.findOneAndUpdate({ guildId }, update, { upsert: true, new: true, runValidators: true });

      // Check API key status
      let hasApiKey = false;
      try {
        hasApiKey = await deps.guildEnvService.hasEnv(guildId, "VC_TRANSCRIPTION_OPENAI_KEY");
      } catch {
        // ignore
      }

      log.info(`VC transcription config updated for guild ${guildId}`);

      // Trigger model download if mode is active and provider is local
      const savedMode = config.mode as TranscriptionMode;
      const savedProvider = config.whisperProvider as WhisperProvider;
      const savedModel = config.whisperModel as string;
      if (savedMode !== TranscriptionMode.DISABLED && savedProvider === WhisperProvider.LOCAL) {
        if (!isModelDownloaded(savedModel)) {
          // Fire-and-forget — download happens in background with WS progress events
          deps.queueService.downloadModel(savedModel, guildId).catch((err) => {
            log.error(`Background model download failed for "${savedModel}":`, err);
          });
        }
      }

      return res.json({
        success: true,
        data: {
          guildId: config.guildId,
          mode: config.mode,
          whisperProvider: config.whisperProvider,
          whisperModel: config.whisperModel,
          roleFilter: config.roleFilter,
          channelFilter: config.channelFilter,
          languageGate: {
            enabled: config.languageGate?.enabled ?? false,
            allowedLanguages: config.languageGate?.allowedLanguages ?? [],
          },
          maxConcurrentTranscriptions: config.maxConcurrentTranscriptions ?? 1,
          maxQueueSize: config.maxQueueSize ?? 0,
          hasApiKey,
        },
      });
    } catch (error) {
      log.error("Failed to update transcription config:", error);
      return res.status(500).json({ success: false, error: { message: "Failed to update config" } });
    }
  });

  /**
   * DELETE /config — Reset transcription config for the guild
   */
  router.delete("/config", async (req: Request, res: Response) => {
    const guildId = req.params.guildId as string;

    try {
      await VoiceTranscriptionConfig.deleteOne({ guildId });

      // Also clean up the API key
      try {
        await deps.guildEnvService.deleteEnv(guildId, "VC_TRANSCRIPTION_OPENAI_KEY");
      } catch {
        // ignore
      }

      log.info(`VC transcription config deleted for guild ${guildId}`);

      return res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      log.error("Failed to delete transcription config:", error);
      return res.status(500).json({ success: false, error: { message: "Failed to delete config" } });
    }
  });

  /**
   * GET /model-status — Get download status of all local whisper models
   */
  router.get("/model-status", async (_req: Request, res: Response) => {
    try {
      const models: Record<string, { downloaded: boolean; downloading: boolean; percent?: number; totalMB?: number; downloadedMB?: number }> = {};

      for (const modelName of Object.keys(WHISPER_MODELS)) {
        const downloaded = isModelDownloaded(modelName);
        const progress = deps.queueService.getDownloadProgress(modelName);
        models[modelName] = {
          downloaded,
          downloading: progress?.status === "downloading",
          ...(progress?.status === "downloading"
            ? {
                percent: progress.percent,
                totalMB: progress.totalMB,
                downloadedMB: progress.downloadedMB,
              }
            : {}),
        };
      }

      return res.json({ success: true, data: { models } });
    } catch (error) {
      log.error("Failed to get model status:", error);
      return res.status(500).json({ success: false, error: { message: "Failed to get model status" } });
    }
  });

  return router;
}
