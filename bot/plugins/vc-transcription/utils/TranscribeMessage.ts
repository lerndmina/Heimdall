/**
 * TranscribeMessage — Core voice message transcription engine
 *
 * Supports two providers:
 * - LOCAL: Uses nodejs-whisper (whisper.cpp) for on-device transcription
 * - OPENAI: Uses OpenAI's Whisper API with per-guild encrypted API keys
 *
 * Pipeline: Download OGG → Convert to WAV → Transcribe → Cleanup → Reply
 */

import fs from "fs";
import path from "path";
import { type Client, type Message, MessageFlags } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import { WhisperProvider } from "../types/index.js";
import { downloadFile, convertFile, deleteFile, checkFfmpeg, getTempPath } from "./FileHelpers.js";
import type { GuildEnvService } from "../../../src/core/services/GuildEnvService.js";
import type { LanguageGateConfig } from "../types/index.js";

const log = createLogger("vc-transcription");

/** OpenAI API key env key stored per-guild via GuildEnvService */
export const OPENAI_API_KEY_ENV = "VC_TRANSCRIPTION_OPENAI_KEY";

/** Progress callback for model downloads */
export type DownloadProgressCallback = (percent: number, downloadedMB: number, totalMB: number) => void;

export interface TranscribeOptions {
  provider: WhisperProvider;
  model: string;
  guildId: string;
  guildEnvService: GuildEnvService;
  languageGate?: LanguageGateConfig;
  /** If provided, edit this message with the result instead of replying to the voice message */
  replyMessage?: Message;
}

interface OpenAITranscriptionResult {
  transcription: string;
  englishTranslation?: string;
}

/**
 * Transcribe a Discord voice message and reply with the result.
 * Returns true on success, false on failure.
 */
export async function transcribeMessage(client: Client<true>, message: Message, options: TranscribeOptions): Promise<boolean> {
  const { provider, model, guildId, guildEnvService, languageGate, replyMessage } = options;

  /** Helper: send result via edit-in-place or reply */
  const sendResult = async (content: string) => {
    if (replyMessage) {
      await replyMessage.edit(content);
    } else {
      await message.reply(content);
    }
  };

  // Validate ffmpeg availability
  const ffmpegAvailable = await checkFfmpeg();
  if (!ffmpegAvailable) {
    await sendResult("Sorry, FFmpeg is not available. Voice transcription cannot work without it.");
    return false;
  }

  // Validate attachment
  const attachment = message.attachments.first();
  if (!attachment) return false;

  if (attachment.contentType !== "audio/ogg") {
    await sendResult("Sorry, I can only transcribe OGG voice messages.");
    return false;
  }

  if (attachment.size > 25_000_000) {
    await sendResult("Sorry, I can only transcribe files smaller than 25MB.");
    return false;
  }

  // Show typing indicator
  if ("sendTyping" in message.channel) {
    try {
      await message.channel.sendTyping();
    } catch {
      // Ignore typing errors
    }
  }

  const fileName = `transcribe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Download the voice message
    const url = new URL(attachment.url);
    await downloadFile(url, fileName, "ogg");

    // Convert OGG to WAV
    await convertFile(fileName, "ogg", "wav");
    deleteFile(fileName, "ogg");

    let transcription: string;
    let englishTranslation: string | undefined;

    if (provider === WhisperProvider.OPENAI) {
      const openAiResult = await transcribeWithOpenAI(fileName, model, guildId, guildEnvService);
      transcription = openAiResult.transcription;
      englishTranslation = openAiResult.englishTranslation;
    } else {
      if (languageGate?.enabled) {
        const allowedLanguages = new Set((languageGate.allowedLanguages ?? []).map((lang) => lang.trim().toLowerCase()).filter(Boolean));

        if (allowedLanguages.size > 0) {
          const detectedLanguage = await detectLocalLanguage(fileName, model);

          if (!detectedLanguage) {
            await sendResult("I couldn't reliably detect the language in this voice message. Please use a multilingual Whisper model or disable the language gate.");
            return false;
          }

          if (!allowedLanguages.has(detectedLanguage)) {
            await sendResult(`🚫 This voice message appears to be in \`${detectedLanguage}\`, which is blocked by this server's language gate.`);
            return false;
          }
        }
      }

      transcription = await transcribeWithLocal(fileName, model);
    }

    // Cleanup WAV file
    deleteFile(fileName, "wav");

    if (!transcription || transcription.trim().length === 0) {
      await sendResult("I couldn't detect any speech in this voice message.");
      return false;
    }

    // Clean up timestamps from whisper output
    transcription = transcription.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, "").trim();
    if (englishTranslation) {
      englishTranslation = englishTranslation.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, "").trim();
    }

    const channelName = !message.channel.isDMBased() ? message.channel.name : "Direct Messages";
    log.info(`Transcribed voice message from ${message.author.username} in ${channelName}`);

    await sendResult(formatTranscriptionReply(transcription, englishTranslation));
    return true;
  } catch (error) {
    log.error("Failed to transcribe voice message:", error);
    // Cleanup on error
    deleteFile(fileName, "ogg");
    deleteFile(fileName, "wav");
    await sendResult("Sorry, I encountered an error while transcribing this voice message.");
    return false;
  }
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldShowTranslation(transcription: string, translation?: string): translation is string {
  if (!translation) return false;
  const normalizedTranscript = normalizeForCompare(transcription);
  const normalizedTranslation = normalizeForCompare(translation);
  if (!normalizedTranscript || !normalizedTranslation) return false;
  return normalizedTranscript !== normalizedTranslation;
}

function truncateWithEllipsis(text: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return ".".repeat(maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatTranscriptionReply(transcription: string, englishTranslation?: string): string {
  const prefix = "✨ **Voice Transcription:**\n\n";

  if (!shouldShowTranslation(transcription, englishTranslation)) {
    const maxContentLen = 2000 - prefix.length - 8; // 8 for ``` markers
    const safeTranscription = truncateWithEllipsis(transcription, maxContentLen);
    return `${prefix}\`\`\`${safeTranscription}\`\`\``;
  }

  const sectionHeader = "**Transcription**\n";
  const translationHeader = "\n\n**Translation**\n";
  const codeFenceLen = 6; // two sets of ``` around each section
  const fixedLen = prefix.length + sectionHeader.length + translationHeader.length + codeFenceLen * 2;
  const budget = Math.max(0, 2000 - fixedLen);

  const translated = englishTranslation;
  const totalLen = transcription.length + translated.length;

  let transcriptionBudget = Math.floor((transcription.length / Math.max(1, totalLen)) * budget);
  let translationBudget = budget - transcriptionBudget;

  const minPerSection = Math.min(120, Math.floor(budget / 2));
  if (transcriptionBudget < minPerSection) {
    const deficit = minPerSection - transcriptionBudget;
    transcriptionBudget += deficit;
    translationBudget = Math.max(0, translationBudget - deficit);
  }
  if (translationBudget < minPerSection) {
    const deficit = minPerSection - translationBudget;
    translationBudget += deficit;
    transcriptionBudget = Math.max(0, transcriptionBudget - deficit);
  }

  const safeTranscription = truncateWithEllipsis(transcription, transcriptionBudget);
  const safeTranslation = truncateWithEllipsis(translated, translationBudget);

  return `${prefix}**Transcription**\n\`\`\`${safeTranscription}\`\`\`${translationHeader}\`\`\`${safeTranslation}\`\`\``;
}

/**
 * Persistent models directory — prefers /app/models/whisper (Docker volume mount)
 * with fallback to node_modules path.
 */
export function getModelsDir(): string {
  const persistentDir = "/app/models/whisper";
  const nodeModulesDir = path.join(process.cwd(), "node_modules/nodejs-whisper/cpp/whisper.cpp/models");

  // Use the persistent path if it exists or can be created
  try {
    if (fs.existsSync(persistentDir)) return persistentDir;
    // Try to create it — will succeed if the volume is mounted or we have write access
    fs.mkdirSync(persistentDir, { recursive: true });
    return persistentDir;
  } catch {
    // Fall back to node_modules path
    return nodeModulesDir;
  }
}

/** Check if a whisper model is downloaded and ready to use */
export function isModelDownloaded(model: string): boolean {
  const modelInfo = WHISPER_MODELS[model];
  if (!modelInfo) return false;
  const modelPath = path.join(getModelsDir(), modelInfo.filename);
  return fs.existsSync(modelPath);
}

/** HuggingFace URLs and filenames for each whisper.cpp GGML model */
export const WHISPER_MODELS: Record<string, { url: string; filename: string }> = {
  "tiny.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
    filename: "ggml-tiny.en.bin",
  },
  "base.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
    filename: "ggml-base.en.bin",
  },
  "small.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
    filename: "ggml-small.en.bin",
  },
  "medium.en": {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
    filename: "ggml-medium.en.bin",
  },
  large: {
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    filename: "ggml-large-v3-turbo.bin",
  },
};

/** Track in-flight downloads to avoid concurrent duplicate fetches */
const activeDownloads = new Map<string, Promise<void>>();

/**
 * Download a whisper model from HuggingFace if not already present.
 * Uses a lock map to prevent concurrent downloads of the same model.
 * Accepts an optional progress callback for streaming download progress.
 */
export async function downloadWhisperModel(model: string, modelsDir: string, onProgress?: DownloadProgressCallback): Promise<void> {
  const modelInfo = WHISPER_MODELS[model];
  if (!modelInfo) {
    throw new Error(`Unknown whisper model "${model}". Available: ${Object.keys(WHISPER_MODELS).join(", ")}`);
  }
  const { url } = modelInfo;

  // Dedupe concurrent requests for the same model
  const existing = activeDownloads.get(model);
  if (existing) {
    log.info(`Model "${model}" download already in progress, waiting...`);
    return existing;
  }

  const downloadPromise = (async () => {
    const destPath = path.join(modelsDir, modelInfo.filename);
    const tmpPath = `${destPath}.downloading`;

    log.info(`Downloading whisper model "${model}" from HuggingFace...`);

    try {
      // Ensure models directory exists
      fs.mkdirSync(modelsDir, { recursive: true });

      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get("content-length");
      const totalBytes = contentLength ? Number(contentLength) : 0;
      const totalMB = totalBytes / 1024 / 1024;
      const sizeMB = totalBytes ? `${totalMB.toFixed(0)} MB` : "unknown size";
      log.info(`Downloading ${sizeMB} for model "${model}"...`);

      // Stream to a temp file with progress reporting
      if (onProgress && response.body && totalBytes > 0) {
        const writer = fs.createWriteStream(tmpPath);

        // Attach error handler IMMEDIATELY to prevent uncaught exceptions
        // (e.g. EACCES when the file can't be opened).
        let writerError: Error | null = null;
        writer.on("error", (err) => {
          writerError = err;
        });

        // Wait for the stream to be ready (file descriptor opened)
        await new Promise<void>((resolve, reject) => {
          writer.on("open", () => resolve());
          writer.on("error", reject);
        });

        let downloadedBytes = 0;
        let lastProgressReport = 0;

        const reader = response.body.getReader();
        try {
          while (true) {
            if (writerError) throw writerError;
            const { done, value } = await reader.read();
            if (done) break;
            const ok = writer.write(Buffer.from(value));
            downloadedBytes += value.byteLength;

            // Apply backpressure — wait for drain if the internal buffer is full
            if (!ok) {
              await new Promise<void>((resolve) => writer.once("drain", resolve));
            }
            if (writerError) throw writerError;

            // Report progress at most every 500ms to avoid spamming
            const now = Date.now();
            if (now - lastProgressReport >= 500) {
              const percent = Math.round((downloadedBytes / totalBytes) * 100);
              const downloadedMB = downloadedBytes / 1024 / 1024;
              onProgress(percent, Math.round(downloadedMB * 10) / 10, Math.round(totalMB * 10) / 10);
              lastProgressReport = now;
            }
          }
        } finally {
          writer.end();
        }
        // Wait for the write stream to finish flushing
        await new Promise<void>((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });
        if (writerError) throw writerError;
        // Final 100% progress
        onProgress(100, Math.round(totalMB * 10) / 10, Math.round(totalMB * 10) / 10);
      } else {
        // No progress callback — use simple arrayBuffer approach
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));
      }

      fs.renameSync(tmpPath, destPath);
      log.info(`Successfully downloaded whisper model "${model}"`);
    } catch (error) {
      // Clean up partial download
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore cleanup errors */
      }
      throw new Error(`Failed to download whisper model "${model}": ${error}`);
    } finally {
      activeDownloads.delete(model);
    }
  })();

  activeDownloads.set(model, downloadPromise);
  return downloadPromise;
}

/**
 * Transcribe using local whisper.cpp directly via child_process.
 *
 * Bypasses the nodejs-whisper wrapper to avoid:
 * - Buggy CLI flag generation (e.g. `-sow true` treated as input file)
 * - `shelljs.cd()` globally mutating process.cwd()
 * - Missing `--no-timestamps` support
 * - No timeout or signal reporting
 */
async function transcribeWithLocal(fileName: string, model: string): Promise<string> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const filePath = getTempPath(fileName, "wav");

  // Resolve whisper.cpp paths
  const whisperCppDir = path.join(process.cwd(), "node_modules/nodejs-whisper/cpp/whisper.cpp");
  const executablePath = path.join(whisperCppDir, "build/bin/whisper-cli");
  const modelsDir = getModelsDir();

  const modelInfo = WHISPER_MODELS[model];
  if (!modelInfo) {
    throw new Error(`Unknown whisper model "${model}". Available: ${Object.keys(WHISPER_MODELS).join(", ")}`);
  }
  const modelPath = path.join(modelsDir, modelInfo.filename);

  // Verify executable exists
  if (!fs.existsSync(executablePath)) {
    throw new Error(`whisper-cli not found at: ${executablePath}`);
  }

  // Download model on demand if not already installed
  if (!fs.existsSync(modelPath)) {
    await downloadWhisperModel(model, modelsDir);
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Whisper model not found after download attempt: ${modelPath}`);
    }
  }

  const args = [
    "--no-gpu", // Force CPU-only (no GPU available in Docker)
    "--no-timestamps", // Clean text output without timestamp prefixes
    "-l",
    "en", // Language
    "-m",
    modelPath, // Absolute model path
    "-f",
    filePath, // Input WAV file
  ];

  log.debug(`Executing whisper-cli: ${executablePath} ${args.join(" ")}`);

  // Larger models need more time — scale timeout accordingly
  const isLargeModel = model === "large" || model === "medium.en";
  const timeoutMs = isLargeModel ? 300_000 : 120_000; // 5 min for large/medium, 2 min for others

  try {
    const { stdout, stderr } = await execFileAsync(executablePath, args, {
      cwd: whisperCppDir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB output buffer
    });

    if (stderr) {
      log.debug(`whisper-cli stderr (truncated): ${stderr.substring(0, 500)}`);
    }

    // whisper-cli prints transcript text to stdout
    return stdout?.trim() || "";
  } catch (error: unknown) {
    const execError = error as { killed?: boolean; signal?: string; code?: number | string; stderr?: string };
    if (execError.killed) {
      throw new Error(`whisper-cli was killed (timeout or OOM). Signal: ${execError.signal ?? "unknown"}`);
    }
    if (execError.code === "ENOENT") {
      throw new Error(`whisper-cli executable not found: ${executablePath}`);
    }
    const stderr = execError.stderr?.substring(0, 500) || "";
    throw new Error(`whisper-cli failed (exit ${execError.code}, signal ${execError.signal ?? "none"}): ${stderr}`);
  }
}

/**
 * Detect language using local whisper-cli.
 * Returns ISO-like code (e.g. "en", "es") or null if detection is unavailable.
 */
async function detectLocalLanguage(fileName: string, model: string): Promise<string | null> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  const filePath = getTempPath(fileName, "wav");
  const whisperCppDir = path.join(process.cwd(), "node_modules/nodejs-whisper/cpp/whisper.cpp");
  const executablePath = path.join(whisperCppDir, "build/bin/whisper-cli");
  const modelInfo = WHISPER_MODELS[model];
  if (!modelInfo) return null;

  const modelPath = path.join(getModelsDir(), modelInfo.filename);
  if (!fs.existsSync(executablePath) || !fs.existsSync(modelPath)) return null;

  const args = ["--no-gpu", "--detect-language", "-m", modelPath, "-f", filePath];

  try {
    const { stdout, stderr } = await execFileAsync(executablePath, args, {
      cwd: whisperCppDir,
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const output = `${stdout ?? ""}\n${stderr ?? ""}`;
    const patterns = [/language\s*[:=]\s*([a-z]{2,8})\b/i, /auto[-\s]?detected\s+language\s*[:=]?\s*([a-z]{2,8})\b/i, /\blang\s*=\s*([a-z]{2,8})\b/i];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Transcribe using OpenAI's Whisper API.
 * Retrieves the per-guild encrypted API key via GuildEnvService.
 */
async function transcribeWithOpenAI(fileName: string, model: string, guildId: string, guildEnvService: GuildEnvService): Promise<OpenAITranscriptionResult> {
  const apiKey = await guildEnvService.getEnv(guildId, OPENAI_API_KEY_ENV);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured for this guild. Set it in the dashboard.");
  }

  const filePath = getTempPath(fileName, "wav");
  const fileBuffer = fs.readFileSync(filePath);

  const transcription = await callOpenAIAudioEndpoint({
    endpoint: "transcriptions",
    model,
    fileName,
    fileBuffer,
    apiKey,
    responseFormat: "text",
  });

  let englishTranslation: string | undefined;
  try {
    const translated = await callOpenAIAudioEndpoint({
      endpoint: "translations",
      model: "whisper-1",
      fileName,
      fileBuffer,
      apiKey,
      responseFormat: "text",
    });

    if (translated) {
      englishTranslation = translated;
    }
  } catch (error) {
    log.warn("OpenAI translation failed; returning transcription only:", error);
  }

  return {
    transcription: transcription.trim(),
    englishTranslation: englishTranslation?.trim() || undefined,
  };
}

interface OpenAIAudioRequestOptions {
  endpoint: "transcriptions" | "translations";
  model: string;
  fileName: string;
  fileBuffer: Buffer;
  apiKey: string;
  responseFormat: "text" | "json" | "verbose_json" | "srt" | "vtt" | "diarized_json";
}

function buildMultipartBody(fileName: string, fileBuffer: Buffer, fields: Array<[string, string]>): { body: Buffer; boundary: string } {
  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const parts: Buffer[] = [];

  parts.push(Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="file"; filename="${fileName}.wav"\r\n` + `Content-Type: audio/wav\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from("\r\n"));

  for (const [fieldName, value] of fields) {
    parts.push(Buffer.from(`--${boundary}\r\n` + `Content-Disposition: form-data; name="${fieldName}"\r\n\r\n` + `${value}\r\n`));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    boundary,
  };
}

async function callOpenAIAudioEndpoint(options: OpenAIAudioRequestOptions): Promise<string> {
  const { endpoint, model, fileName, fileBuffer, apiKey, responseFormat } = options;

  const { body, boundary } = buildMultipartBody(fileName, fileBuffer, [
    ["model", model],
    ["response_format", responseFormat],
  ]);

  const response = await fetch(`https://api.openai.com/v1/audio/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`OpenAI audio ${endpoint} API error (${response.status}):`, errorText);
    throw new Error(`OpenAI ${endpoint} API returned ${response.status}: ${errorText}`);
  }

  const text = await response.text();
  return text.trim();
}
