/**
 * VoiceTranscriptionConfig — Per-guild voice message transcription settings
 *
 * Stores transcription mode, Whisper provider/model selection,
 * and role/channel filter configuration.
 */

import mongoose, { type Document, Schema, model } from "mongoose";
import {
  TranscriptionMode,
  WhisperProvider,
  FilterMode,
  LOCAL_WHISPER_MODELS,
  OPENAI_WHISPER_MODELS,
} from "../types/index.js";

export interface VoiceTranscriptionConfigType extends Document {
  guildId: string;
  mode: TranscriptionMode;
  whisperProvider: WhisperProvider;
  whisperModel: string;
  roleFilter: {
    mode: FilterMode;
    roles: string[];
  };
  channelFilter: {
    mode: FilterMode;
    channels: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const VoiceTranscriptionConfigSchema = new Schema<VoiceTranscriptionConfigType>(
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
      validate: {
        validator: function (this: VoiceTranscriptionConfigType, v: string) {
          if (this.whisperProvider === WhisperProvider.LOCAL) {
            return (LOCAL_WHISPER_MODELS as readonly string[]).includes(v);
          }
          return (OPENAI_WHISPER_MODELS as readonly string[]).includes(v);
        },
        message: "Invalid whisper model for the selected provider",
      },
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

export default mongoose.models.VoiceTranscriptionConfig ||
  model<VoiceTranscriptionConfigType>("VoiceTranscriptionConfig", VoiceTranscriptionConfigSchema);
