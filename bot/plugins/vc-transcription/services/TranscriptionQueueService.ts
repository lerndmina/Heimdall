/**
 * TranscriptionQueueService — Manages queued voice message transcriptions
 *
 * Features:
 * - Configurable max concurrent transcriptions (default 1)
 * - Configurable max queue size (default 0 = unlimited)
 * - Edit-in-place position updates every 5 seconds
 * - On-demand model downloads with progress via WebSocket
 * - Model download progress relayed to queued message replies
 */

import type { GuildTextBasedChannel, Message } from "discord.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { GuildEnvService } from "../../../src/core/services/GuildEnvService.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcast } from "../../../src/core/broadcast.js";
import VoiceTranscriptionConfig from "../models/VoiceTranscriptionConfig.js";
import TranscriptionJob, { TranscriptionJobStatus } from "../models/TranscriptionJob.js";
import { transcribeMessage, downloadWhisperModel, isModelDownloaded, getModelsDir, WHISPER_MODELS, type TranscribeOptions, type DownloadProgressCallback } from "../utils/TranscribeMessage.js";

const log = createLogger("vc-transcription");

interface QueueEntry {
  message: Message;
  replyMessage: Message;
  options: TranscribeOptions;
  addedAt: number;
}

export interface DownloadProgressInfo {
  percent: number;
  downloadedMB: number;
  totalMB: number;
  status: "downloading" | "ready" | "error";
}

export class TranscriptionQueueService {
  private queue: QueueEntry[] = [];
  private activeCount = 0;
  private positionUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private isUpdatingPositions = false;
  private downloadProgress = new Map<string, DownloadProgressInfo>();
  private client: HeimdallClient;
  private guildEnvService: GuildEnvService;

  constructor(client: HeimdallClient, guildEnvService: GuildEnvService) {
    this.client = client;
    this.guildEnvService = guildEnvService;
  }

  /**
   * Restore persisted queued/in-progress jobs after bot restart.
   */
  async resumePendingJobs(): Promise<void> {
    const pendingJobs = await TranscriptionJob.find({
      status: { $in: [TranscriptionJobStatus.QUEUED, TranscriptionJobStatus.PROCESSING] },
    })
      .sort({ createdAt: 1 })
      .lean();

    if (pendingJobs.length === 0) return;

    log.info(`Resuming ${pendingJobs.length} persisted transcription job(s) after restart`);

    for (const job of pendingJobs) {
      try {
        const channel = await this.client.channels.fetch(job.channelId);
        if (!channel || !channel.isTextBased() || !("messages" in channel)) {
          await TranscriptionJob.deleteOne({ messageId: job.messageId });
          continue;
        }

        const textChannel = channel as GuildTextBasedChannel;

        const originalMessage = await textChannel.messages.fetch(job.messageId).catch(() => null);
        if (!originalMessage) {
          await TranscriptionJob.deleteOne({ messageId: job.messageId });
          continue;
        }

        let replyMessage = await textChannel.messages.fetch(job.replyMessageId).catch(() => null);
        if (!replyMessage) {
          replyMessage = await originalMessage.reply("⏳ Resuming transcription after bot restart...").catch(() => null);
          if (!replyMessage) {
            await TranscriptionJob.deleteOne({ messageId: job.messageId });
            continue;
          }

          await TranscriptionJob.updateOne(
            { messageId: job.messageId },
            {
              $set: {
                replyMessageId: replyMessage.id,
                status: TranscriptionJobStatus.QUEUED,
              },
            },
          );
        }

        this.queue.push({
          message: originalMessage,
          replyMessage,
          options: {
            provider: job.provider,
            model: job.model,
            guildId: job.guildId,
            guildEnvService: this.guildEnvService,
            languageGate: {
              enabled: Boolean(job.languageGate?.enabled),
              allowedLanguages: Array.isArray(job.languageGate?.allowedLanguages) ? job.languageGate.allowedLanguages : [],
            },
            translationEnabled: (await VoiceTranscriptionConfig.findOne({ guildId: job.guildId }).lean())?.translationEnabled ?? false,
            replyMessage,
          },
          addedAt: Date.now(),
        });
      } catch (error) {
        log.error(`Failed to restore transcription job for message ${job.messageId}:`, error);
        await TranscriptionJob.deleteOne({ messageId: job.messageId });
      }
    }

    if (this.queue.length > 0) {
      this.startPositionUpdater();
      await this.processNext();
    }
  }

  /**
   * Enqueue a voice message for transcription.
   * Immediately replies with a status message, then processes when a slot opens.
   */
  async enqueue(message: Message, options: TranscribeOptions): Promise<void> {
    const guildId = options.guildId;

    // Load queue config
    const config = await VoiceTranscriptionConfig.findOne({ guildId });
    const maxConcurrent = config?.maxConcurrentTranscriptions ?? 1;
    const maxQueueSize = config?.maxQueueSize ?? 0;

    // Check queue size limit (0 = unlimited)
    if (maxQueueSize > 0 && this.queue.length >= maxQueueSize) {
      await message.reply("❌ Transcription queue is full. Please try again later.");
      return;
    }

    // Check if model is downloading (local provider only)
    const modelDownload = this.downloadProgress.get(options.model);
    const isDownloading = modelDownload?.status === "downloading";

    // Build initial status message
    let statusText: string;
    if (isDownloading) {
      const pos = this.queue.length + 1;
      statusText = `⏳ Transcription model is downloading (${modelDownload.percent}%)... your message is queued (position ${pos})`;
    } else if (this.activeCount < maxConcurrent) {
      statusText = "⏳ Transcribing...";
    } else {
      const pos = this.queue.length + 1;
      statusText = `⏳ Queued for transcription (position ${pos})...`;
    }

    const replyMessage = await message.reply(statusText);

    const entry: QueueEntry = {
      message,
      replyMessage,
      options: { ...options, replyMessage },
      addedAt: Date.now(),
    };

    // Persist queued work so it can be resumed after restart.
    try {
      await TranscriptionJob.updateOne(
        { messageId: message.id },
        {
          $set: {
            guildId: options.guildId,
            channelId: message.channelId,
            messageId: message.id,
            replyMessageId: replyMessage.id,
            provider: options.provider,
            model: options.model,
            languageGate: {
              enabled: Boolean(options.languageGate?.enabled),
              allowedLanguages: options.languageGate?.allowedLanguages ?? [],
            },
            status: TranscriptionJobStatus.QUEUED,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      log.error(`Failed to persist queued transcription job for message ${message.id}:`, error);
    }

    // Always enqueue first so queue order is preserved and draining logic is centralized.
    this.queue.push(entry);
    this.startPositionUpdater();

    // Try to drain immediately if capacity is available and model is ready.
    // Using processNext() here also recovers from any previously missed wake-up.
    void this.processNext().catch((error) => {
      log.error("Failed to process transcription queue after enqueue:", error);
    });
  }

  /**
   * Process a single queue entry — runs transcription and edits the reply in-place.
   */
  private async processEntry(entry: QueueEntry): Promise<void> {
    this.activeCount++;

    try {
      try {
        await TranscriptionJob.updateOne(
          { messageId: entry.message.id },
          {
            $set: {
              status: TranscriptionJobStatus.PROCESSING,
            },
          },
        );
      } catch (error) {
        log.error(`Failed to mark transcription job as processing for message ${entry.message.id}:`, error);
      }

      // Update status to "transcribing"
      try {
        await entry.replyMessage.edit("⏳ Transcribing...");
      } catch {
        // Message may have been deleted
      }

      // Run the actual transcription (result is edited into replyMessage)
      await transcribeMessage(this.client, entry.message, entry.options);
    } catch (error) {
      log.error("Queue entry processing failed:", error);
      try {
        await entry.replyMessage.edit("Sorry, I encountered an error while transcribing this voice message.");
      } catch {
        // Message may have been deleted
      }
    } finally {
      try {
        await TranscriptionJob.deleteOne({ messageId: entry.message.id });
      } catch (error) {
        log.error(`Failed to clear transcription job for message ${entry.message.id}:`, error);
      }

      this.activeCount--;
      this.processNext();
    }
  }

  /**
   * Dequeue and process entries up to the max concurrent limit.
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      if (this.activeCount === 0) {
        this.stopPositionUpdater();
      }
      return;
    }

    // Reload config for current maxConcurrent
    // Use the guildId from the first queued entry
    const guildId = this.queue[0]?.options.guildId;
    let maxConcurrent = 1;
    if (guildId) {
      const config = await VoiceTranscriptionConfig.findOne({ guildId });
      maxConcurrent = config?.maxConcurrentTranscriptions ?? 1;
    }

    while (this.activeCount < maxConcurrent && this.queue.length > 0) {
      // Don't dequeue if the model is still downloading
      const nextEntry = this.queue[0];
      if (nextEntry) {
        const modelDownload = this.downloadProgress.get(nextEntry.options.model);
        if (modelDownload?.status === "downloading") {
          break; // Wait for download to finish
        }
      }

      const entry = this.queue.shift()!;
      void this.processEntry(entry);
    }

    if (this.queue.length === 0 && this.activeCount === 0) {
      this.stopPositionUpdater();
    }
  }

  /**
   * Start the 5-second interval that updates queue position messages.
   */
  private startPositionUpdater(): void {
    if (this.positionUpdateInterval) return;

    this.positionUpdateInterval = setInterval(() => {
      this.updatePositions();
    }, 5000);
  }

  /**
   * Stop the position updater interval.
   */
  private stopPositionUpdater(): void {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }

  /**
   * Edit each queued entry's reply message with its current position.
   */
  private async updatePositions(): Promise<void> {
    if (this.isUpdatingPositions || this.queue.length === 0) return;
    this.isUpdatingPositions = true;

    try {
      for (let i = 0; i < this.queue.length; i++) {
        const entry = this.queue[i];
        if (!entry) continue;

        const position = i + 1;
        const modelDownload = this.downloadProgress.get(entry.options.model);

        let statusText: string;
        if (modelDownload?.status === "downloading") {
          statusText = `⏳ Transcription model is downloading (${modelDownload.percent}%)... your message is queued (position ${position})`;
        } else {
          statusText = `⏳ Queued for transcription (position ${position})...`;
        }

        try {
          await entry.replyMessage.edit(statusText);
        } catch {
          // Message may have been deleted — remove from queue
          try {
            await TranscriptionJob.deleteOne({ messageId: entry.message.id });
          } catch (error) {
            log.error(`Failed to clear transcription job after message deletion for ${entry.message.id}:`, error);
          }
          this.queue.splice(i, 1);
          i--;
        }
      }
    } finally {
      this.isUpdatingPositions = false;
    }

    // Self-heal: if entries are waiting and no workers are active, try draining again.
    // This guards against rare missed wake-ups after model download completion.
    if (this.queue.length > 0 && this.activeCount === 0) {
      void this.processNext().catch((error) => {
        log.error("Failed to process transcription queue after position update:", error);
      });
    }
  }

  /**
   * Download a whisper model with live progress broadcast via WebSocket.
   * Called from the API config PUT handler when a non-disabled local config is saved.
   */
  async downloadModel(model: string, guildId: string): Promise<void> {
    if (isModelDownloaded(model)) return;

    // Check if already downloading
    if (this.downloadProgress.has(model)) return;

    const modelsDir = getModelsDir();

    this.downloadProgress.set(model, {
      percent: 0,
      downloadedMB: 0,
      totalMB: 0,
      status: "downloading",
    });

    const onProgress: DownloadProgressCallback = (percent, downloadedMB, totalMB) => {
      this.downloadProgress.set(model, { percent, downloadedMB, totalMB, status: "downloading" });
      broadcast(guildId, "vc-transcription:model_download_progress", {
        model,
        percent,
        totalMB,
        downloadedMB,
        status: "downloading",
      });
    };

    try {
      await downloadWhisperModel(model, modelsDir, onProgress);

      this.downloadProgress.delete(model);
      broadcast(guildId, "vc-transcription:model_download_complete", {
        model,
        status: "ready",
      });

      // Drain any queued entries waiting for this model
      await this.processNext();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Model download failed for "${model}":`, error);
      this.downloadProgress.delete(model);
      broadcast(guildId, "vc-transcription:model_download_error", {
        model,
        error: errorMsg,
      });
    }
  }

  /**
   * Check if a model is downloaded and ready.
   */
  isModelReady(model: string): boolean {
    return isModelDownloaded(model);
  }

  /**
   * Get download progress for a model (or null if not downloading).
   */
  getDownloadProgress(model: string): DownloadProgressInfo | null {
    return this.downloadProgress.get(model) ?? null;
  }

  /**
   * Get download progress for all currently downloading models.
   */
  getAllDownloadProgress(): Map<string, DownloadProgressInfo> {
    return this.downloadProgress;
  }

  /**
   * Stop the queue service and clear intervals.
   */
  stop(): void {
    this.stopPositionUpdater();
    this.queue = [];
  }
}
