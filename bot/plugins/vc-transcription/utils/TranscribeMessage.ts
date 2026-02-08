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

const log = createLogger("vc-transcription");

/** OpenAI API key env key stored per-guild via GuildEnvService */
export const OPENAI_API_KEY_ENV = "VC_TRANSCRIPTION_OPENAI_KEY";

interface TranscribeOptions {
  provider: WhisperProvider;
  model: string;
  guildId: string;
  guildEnvService: GuildEnvService;
}

/**
 * Transcribe a Discord voice message and reply with the result.
 * Returns true on success, false on failure.
 */
export async function transcribeMessage(
  client: Client<true>,
  message: Message,
  options: TranscribeOptions,
): Promise<boolean> {
  const { provider, model, guildId, guildEnvService } = options;

  // Validate ffmpeg availability
  const ffmpegAvailable = await checkFfmpeg();
  if (!ffmpegAvailable) {
    await message.reply("Sorry, FFmpeg is not available. Voice transcription cannot work without it.");
    return false;
  }

  // Validate attachment
  const attachment = message.attachments.first();
  if (!attachment) return false;

  if (attachment.contentType !== "audio/ogg") {
    await message.reply("Sorry, I can only transcribe OGG voice messages.");
    return false;
  }

  if (attachment.size > 25_000_000) {
    await message.reply("Sorry, I can only transcribe files smaller than 25MB.");
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

    if (provider === WhisperProvider.OPENAI) {
      transcription = await transcribeWithOpenAI(fileName, model, guildId, guildEnvService);
    } else {
      transcription = await transcribeWithLocal(fileName, model);
    }

    // Cleanup WAV file
    deleteFile(fileName, "wav");

    if (!transcription || transcription.trim().length === 0) {
      await message.reply("I couldn't detect any speech in this voice message.");
      return false;
    }

    // Clean up timestamps from whisper output
    transcription = transcription.replace(/\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/g, "").trim();

    const channelName = !message.channel.isDMBased() ? message.channel.name : "Direct Messages";
    log.info(`Transcribed voice message from ${message.author.username} in ${channelName}`);

    // Truncate if needed (Discord message limit)
    const prefix = "✨ **Voice Transcription:**\n\n";
    const maxContentLen = 2000 - prefix.length - 8; // 8 for ``` markers
    if (transcription.length > maxContentLen) {
      transcription = transcription.slice(0, maxContentLen - 3) + "...";
    }

    await message.reply(`${prefix}\`\`\`${transcription}\`\`\``);
    return true;
  } catch (error) {
    log.error("Failed to transcribe voice message:", error);
    // Cleanup on error
    deleteFile(fileName, "ogg");
    deleteFile(fileName, "wav");
    await message.reply("Sorry, I encountered an error while transcribing this voice message.");
    return false;
  }
}

/**
 * Transcribe using local whisper.cpp via nodejs-whisper.
 */
async function transcribeWithLocal(fileName: string, model: string): Promise<string> {
  const { nodewhisper } = await import("nodejs-whisper");
  const filePath = getTempPath(fileName, "wav");

  // Auto-detect installed model if available
  const modelsDir = path.join(process.cwd(), "node_modules/nodejs-whisper/cpp/whisper.cpp/models");
  let installedModel = model;

  try {
    if (fs.existsSync(modelsDir)) {
      const modelFiles = fs.readdirSync(modelsDir);
      const ggmlModel = modelFiles.find((file) => file.startsWith("ggml-") && file.endsWith(".bin"));
      if (ggmlModel) {
        const detectedModel = ggmlModel.replace("ggml-", "").replace(".bin", "");
        log.debug(`Auto-detected installed whisper model: ${detectedModel}`);
        // Prefer the configured model, but fall back to whatever is installed
        const requestedModelFile = `ggml-${model}.bin`;
        if (!modelFiles.includes(requestedModelFile)) {
          log.warn(`Requested model "${model}" not found, using installed model "${detectedModel}"`);
          installedModel = detectedModel;
        }
      }
    }
  } catch {
    log.debug("Could not scan whisper models directory, using configured model");
  }

  const rawOutput = await nodewhisper(filePath, {
    modelName: installedModel,
    autoDownloadModelName: installedModel,
    whisperOptions: {
      outputInText: true,
      outputInVtt: false,
      outputInSrt: false,
      outputInCsv: false,
      translateToEnglish: false,
      language: "en",
      wordTimestamps: false,
      timestamps_length: 60,
      splitOnWord: true,
      gen_file_txt: false,
      gen_file_subtitle: false,
      gen_file_vtt: false,
      no_timestamps: true,
    },
    withCuda: false,
    numberOfProcessors: 1,
    numberOfThreads: 1,
  });

  return typeof rawOutput === "string" ? rawOutput : String(rawOutput);
}

/**
 * Transcribe using OpenAI's Whisper API.
 * Retrieves the per-guild encrypted API key via GuildEnvService.
 */
async function transcribeWithOpenAI(
  fileName: string,
  model: string,
  guildId: string,
  guildEnvService: GuildEnvService,
): Promise<string> {
  const apiKey = await guildEnvService.getEnv(guildId, OPENAI_API_KEY_ENV);
  if (!apiKey) {
    throw new Error("OpenAI API key not configured for this guild. Set it in the dashboard.");
  }

  const filePath = getTempPath(fileName, "wav");
  const fileBuffer = fs.readFileSync(filePath);

  // Build multipart form data
  const boundary = `----FormBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  // File part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from("\r\n"));

  // Model part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${model}\r\n`
  ));

  // Response format part
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `text\r\n`
  ));

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error(`OpenAI API error (${response.status}):`, errorText);
    throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
  }

  const text = await response.text();
  return text.trim();
}
