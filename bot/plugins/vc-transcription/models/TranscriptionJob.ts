/**
 * TranscriptionJob — Persisted queue/in-progress transcription work items.
 *
 * Used to recover queued/processing transcriptions after bot restarts.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import { WhisperProvider } from "../types/index.js";

export enum TranscriptionJobStatus {
  QUEUED = "queued",
  PROCESSING = "processing",
}

const TranscriptionJobSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    replyMessageId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: Object.values(WhisperProvider),
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    languageGate: {
      enabled: {
        type: Boolean,
        default: false,
      },
      allowedLanguages: {
        type: [String],
        default: [],
      },
    },
    status: {
      type: String,
      enum: Object.values(TranscriptionJobStatus),
      default: TranscriptionJobStatus.QUEUED,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

type ITranscriptionJob = InferSchemaType<typeof TranscriptionJobSchema>;

const TranscriptionJob = (mongoose.models.TranscriptionJob || model<ITranscriptionJob>("TranscriptionJob", TranscriptionJobSchema)) as Model<ITranscriptionJob>;

export default TranscriptionJob;
export type { ITranscriptionJob };