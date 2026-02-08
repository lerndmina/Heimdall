/**
 * AttachmentBlockerChannel Model — Per-channel attachment blocking overrides.
 *
 * Each document represents a channel-specific override of the guild defaults.
 * Fields set to null inherit from the guild-wide AttachmentBlockerConfig.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { AttachmentType } from "../utils/attachment-types.js";

// ── Schema ───────────────────────────────────────────────

const AttachmentBlockerChannelSchema = new Schema(
  {
    /** Discord guild ID */
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    /** Discord channel ID */
    channelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Whitelisted types for this channel — null = inherit guild default */
    allowedTypes: {
      type: [String],
      enum: Object.values(AttachmentType),
      default: undefined, // explicitly undefined so we can detect "not set"
    },
    /** Timeout duration override in ms — null = inherit guild default */
    timeoutDuration: {
      type: Number,
      default: undefined,
      min: 0,
    },
    /** Per-channel enabled toggle (can disable blocking for a specific channel) */
    enabled: {
      type: Boolean,
      default: true,
    },
    /** Discord user ID who created this override */
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

AttachmentBlockerChannelSchema.index({ guildId: 1, channelId: 1 });

// ── Type + Export ─────────────────────────────────────────

export type IAttachmentBlockerChannel = InferSchemaType<typeof AttachmentBlockerChannelSchema>;

const AttachmentBlockerChannel = (mongoose.models.AttachmentBlockerChannel ||
  model<IAttachmentBlockerChannel>("AttachmentBlockerChannel", AttachmentBlockerChannelSchema)) as Model<IAttachmentBlockerChannel>;

export default AttachmentBlockerChannel;
