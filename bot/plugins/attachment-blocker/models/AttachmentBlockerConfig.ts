/**
 * AttachmentBlockerConfig Model — Guild-wide default attachment blocking configuration.
 *
 * One document per guild. Defines the baseline whitelist rules that apply
 * to all channels unless overridden by a per-channel config.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { AttachmentType } from "../utils/attachment-types.js";

// ── Schema ───────────────────────────────────────────────

const AttachmentBlockerConfigSchema = new Schema(
  {
    /** Discord guild ID */
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Master toggle for the entire guild */
    enabled: {
      type: Boolean,
      default: false,
    },
    /** Default whitelisted attachment types for the guild */
    defaultAllowedTypes: {
      type: [String],
      enum: Object.values(AttachmentType),
      default: [],
    },
    /** Default timeout duration in ms for violating users (0 = no timeout) */
    defaultTimeoutDuration: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// ── Type + Export ─────────────────────────────────────────

export type IAttachmentBlockerConfig = InferSchemaType<typeof AttachmentBlockerConfigSchema>;

const AttachmentBlockerConfig = (mongoose.models.AttachmentBlockerConfig ||
  model<IAttachmentBlockerConfig>("AttachmentBlockerConfig", AttachmentBlockerConfigSchema)) as Model<IAttachmentBlockerConfig>;

export default AttachmentBlockerConfig;
