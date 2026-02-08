/**
 * AutomodRule Model — Per-guild automod rules with regex patterns.
 *
 * Each rule targets a specific content type (message content, emoji, reactions,
 * usernames, stickers, links) with configurable actions and scoping.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

// ── Enums ────────────────────────────────────────────────

export enum AutomodTarget {
  MESSAGE_CONTENT = "message_content",
  REACTION_EMOJI = "reaction_emoji",
  MESSAGE_EMOJI = "message_emoji",
  USERNAME = "username",
  NICKNAME = "nickname",
  STICKER = "sticker",
  LINK = "link",
}

export enum AutomodAction {
  DELETE = "delete",
  REMOVE_REACTION = "remove_reaction",
  DM = "dm",
  WARN = "warn",
  TIMEOUT = "timeout",
  KICK = "kick",
  BAN = "ban",
  LOG = "log",
}

// ── Pattern Subdocument ──────────────────────────────────

const PatternSchema = new Schema(
  {
    regex: { type: String, required: true },
    flags: { type: String, default: "i" },
    label: { type: String, default: "" },
  },
  { _id: false },
);

// ── Main Rule Schema ─────────────────────────────────────

const AutomodRuleSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    /** Higher priority = checked first */
    priority: {
      type: Number,
      default: 0,
    },
    /** What content type this rule scans */
    target: {
      type: String,
      enum: Object.values(AutomodTarget),
      required: true,
    },
    /** Regex patterns to match against */
    patterns: {
      type: [PatternSchema],
      required: true,
      validate: {
        validator: (v: unknown[]) => v.length > 0,
        message: "At least one pattern is required",
      },
    },
    /** Whether any or all patterns must match */
    matchMode: {
      type: String,
      enum: ["any", "all"],
      default: "any",
    },
    /** Actions to take when rule triggers */
    actions: {
      type: [String],
      enum: Object.values(AutomodAction),
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "At least one action is required",
      },
    },
    /** Points assigned per trigger */
    warnPoints: {
      type: Number,
      default: 1,
    },
    /** Timeout duration in ms (if timeout action) */
    timeoutDuration: {
      type: Number,
      default: null,
    },
    /** Channels to include (empty = all) */
    channelInclude: {
      type: [String],
      default: [],
    },
    /** Channels to exclude */
    channelExclude: {
      type: [String],
      default: [],
    },
    /** Roles to include (empty = all) */
    roleInclude: {
      type: [String],
      default: [],
    },
    /** Roles to exclude */
    roleExclude: {
      type: [String],
      default: [],
    },
    /** Per-rule DM template override */
    dmTemplate: {
      type: String,
      default: null,
    },
    /** Per-rule DM embed override */
    dmEmbed: {
      type: Schema.Types.Mixed,
      default: null,
    },
    /** Per-rule DM mode override */
    dmMode: {
      type: String,
      enum: ["template", "embed", null],
      default: null,
    },
    /** Whether this rule was created from a preset */
    isPreset: {
      type: Boolean,
      default: false,
    },
    /** Preset identifier if created from a preset */
    presetId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Compound unique index: one rule name per guild
AutomodRuleSchema.index({ guildId: 1, name: 1 }, { unique: true });
// Index for efficient rule fetching by guild + target
AutomodRuleSchema.index({ guildId: 1, target: 1, enabled: 1 });

type IAutomodRule = InferSchemaType<typeof AutomodRuleSchema>;

const AutomodRule = (mongoose.models.AutomodRule || model<IAutomodRule>("AutomodRule", AutomodRuleSchema)) as Model<IAutomodRule>;

export default AutomodRule;
export type { IAutomodRule };
