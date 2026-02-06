/**
 * LoggingConfig Model — Per-guild logging configuration with category-based channels
 *
 * Each guild can configure separate log channels for different event categories
 * (messages, users, moderation) with granular subcategory toggles.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

// ── Enums ────────────────────────────────────────────────

export enum LoggingCategory {
  MESSAGES = "messages",
  USERS = "users",
  MODERATION = "moderation",
}

export enum MessageSubcategory {
  EDITS = "edits",
  DELETES = "deletes",
  BULK_DELETES = "bulk_deletes",
}

export enum UserSubcategory {
  PROFILE_UPDATES = "profile_updates",
  MEMBER_UPDATES = "member_updates",
}

export enum ModerationSubcategory {
  BANS = "bans",
  UNBANS = "unbans",
  TIMEOUTS = "timeouts",
}

// ── Schema ───────────────────────────────────────────────

const CategoryConfigSchema = new Schema(
  {
    category: {
      type: String,
      enum: Object.values(LoggingCategory),
      required: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    subcategories: {
      type: Map,
      of: Boolean,
      default: new Map(),
    },
  },
  { _id: false },
);

const LoggingConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    categories: {
      type: [CategoryConfigSchema],
      default: [],
    },
    globalEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

LoggingConfigSchema.index({ guildId: 1, "categories.category": 1 });

type ILoggingConfig = InferSchemaType<typeof LoggingConfigSchema>;

const LoggingConfig = (mongoose.models.LoggingConfig || model<ILoggingConfig>("LoggingConfig", LoggingConfigSchema)) as Model<ILoggingConfig>;

export default LoggingConfig;
export type { ILoggingConfig };
