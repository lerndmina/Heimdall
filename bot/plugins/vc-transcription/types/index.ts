/**
 * VC Transcription Plugin Types
 */

export enum TranscriptionMode {
  DISABLED = "disabled",
  REACTIONS = "reactions",
  AUTO = "auto",
}

export enum WhisperProvider {
  LOCAL = "local",
  OPENAI = "openai",
}

export enum FilterMode {
  DISABLED = "disabled",
  WHITELIST = "whitelist",
  BLACKLIST = "blacklist",
}

/** Available local Whisper models (whisper.cpp GGML) */
export const LOCAL_WHISPER_MODELS = ["tiny.en", "base.en", "small.en", "medium.en", "large"] as const;

/** Available OpenAI transcription API models */
export const OPENAI_WHISPER_MODELS = ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"] as const;

export type LocalWhisperModel = (typeof LOCAL_WHISPER_MODELS)[number];
export type OpenAIWhisperModel = (typeof OPENAI_WHISPER_MODELS)[number];

export interface RoleFilter {
  mode: FilterMode;
  roles: string[];
}

export interface ChannelFilter {
  mode: FilterMode;
  channels: string[];
}

export interface LanguageGateConfig {
  enabled: boolean;
  allowedLanguages: string[];
}
