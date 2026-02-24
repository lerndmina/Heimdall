/**
 * StarboardEntry Model — Tracks source message to starboard/moderation message linkage.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { HydratedDocument, InferSchemaType } from "mongoose";

export const STARBOARD_ENTRY_STATUSES = ["pending", "approved", "denied", "posted"] as const;
export type StarboardEntryStatus = (typeof STARBOARD_ENTRY_STATUSES)[number];

const StarboardEntrySchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    boardId: {
      type: String,
      required: true,
      index: true,
    },
    sourceMessageId: {
      type: String,
      required: true,
      index: true,
    },
    sourceChannelId: {
      type: String,
      required: true,
    },
    starboardMessageId: {
      type: String,
      default: null,
    },
    starboardChannelId: {
      type: String,
      default: null,
    },
    moderationMessageId: {
      type: String,
      default: null,
    },
    moderationChannelId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: STARBOARD_ENTRY_STATUSES,
      default: "posted",
      index: true,
    },
    moderatedBy: {
      type: String,
      default: null,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    reactorIds: {
      type: [String],
      default: [],
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
    locked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

StarboardEntrySchema.index({ guildId: 1, boardId: 1, sourceMessageId: 1 }, { unique: true });

export type IStarboardEntry = InferSchemaType<typeof StarboardEntrySchema>;
export type StarboardEntryDocument = HydratedDocument<IStarboardEntry>;

const StarboardEntryModel = (mongoose.models.StarboardEntry || model("StarboardEntry", StarboardEntrySchema)) as Model<IStarboardEntry>;

export default StarboardEntryModel;
