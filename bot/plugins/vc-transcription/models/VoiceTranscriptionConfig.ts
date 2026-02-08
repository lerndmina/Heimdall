/**
 * VoiceTranscriptionConfig — Per-guild voice message transcription settings
 *
 * Stores transcription mode, Whisper provider/model selection,
 * and role/channel filter configuration.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import {
  TranscriptionMode,
  WhisperProvider,
  FilterMode,
  LOCAL_WHISPER_MODELS,
  OPENAI_WHISPER_MODELS,
} from "../types/index.js";

const VoiceTranscriptionConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    mode: {
      type: String,
      enum: Object.values(TranscriptionMode),
      default: TranscriptionMode.DISABLED,
    },
    whisperProvider: {
      type: String,
      enum: Object.values(WhisperProvider),
      default: WhisperProvider.LOCAL,
    },
    whisperModel: {
      type: String,
      default: "base.en",
    },
    roleFilter: {
      mode: {
        type: String,
        enum: Object.values(FilterMode),
        default: FilterMode.DISABLED,
      },
      roles: {
        type: [String],
        default: [],
      },
    },
    channelFilter: {
      mode: {
        type: String,
        enum: Object.values(FilterMode),
        default: FilterMode.DISABLED,
      },
      channels: {
        type: [String],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  },
);

type IVoiceTranscriptionConfig = InferSchemaType<typeof VoiceTranscriptionConfigSchema>;

const VoiceTranscriptionConfig = (mongoose.models.VoiceTranscriptionConfig ||
  model<IVoiceTranscriptionConfig>("VoiceTranscriptionConfig", VoiceTranscriptionConfigSchema)) as Model<IVoiceTranscriptionConfig>;

export default VoiceTranscriptionConfig;
export type { IVoiceTranscriptionConfig };
