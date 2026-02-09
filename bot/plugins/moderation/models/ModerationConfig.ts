/**
 * ModerationConfig Model — Per-guild moderation configuration.
 *
 * Stores automod master switch, escalation tiers, point decay settings,
 * DM templates, and immune roles. One document per guild.
 */

import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { InferSchemaType } from "mongoose";

// ── Escalation Tier Subdocument ──────────────────────────

const EscalationTierSchema = new Schema(
  {
    name: { type: String, required: true },
    pointsThreshold: { type: Number, required: true },
    action: {
      type: String,
      enum: ["timeout", "kick", "ban"],
      required: true,
    },
    /** Duration in ms (for timeout action) */
    duration: { type: Number, default: null },
    /** Per-tier DM template override */
    dmTemplate: { type: String, default: null },
    /** Per-tier DM embed override */
    dmEmbed: {
      type: Schema.Types.Mixed,
      default: null,
    },
    /** Per-tier DM mode override */
    dmMode: {
      type: String,
      enum: ["template", "embed"],
      default: null,
    },
  },
  { _id: true },
);

// ── Main Config Schema ───────────────────────────────────

const ModerationConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Master switch for automod */
    automodEnabled: {
      type: Boolean,
      default: false,
    },
    /** Fallback log channel if logging plugin unavailable */
    logChannelId: {
      type: String,
      default: null,
    },
    /** Whether infraction points expire over time */
    pointDecayEnabled: {
      type: Boolean,
      default: true,
    },
    /** Number of days before points decay */
    pointDecayDays: {
      type: Number,
      default: 30,
    },
    /** Whether to DM users on infraction */
    dmOnInfraction: {
      type: Boolean,
      default: true,
    },
    /** Default DM template string with variable placeholders */
    defaultDmTemplate: {
      type: String,
      default: null,
    },
    /** Default DM embed config (title, description, color, fields) */
    defaultDmEmbed: {
      type: Schema.Types.Mixed,
      default: null,
    },
    /** Which DM format to use by default */
    dmMode: {
      type: String,
      enum: ["template", "embed"],
      default: "template",
    },
    /** Role IDs globally exempt from automod */
    immuneRoles: {
      type: [String],
      default: [],
    },
    /** Escalation tier configuration */
    escalationTiers: {
      type: [EscalationTierSchema],
      default: [],
    },
    /** Role IDs that bypass channel locks (can still type in locked channels) */
    lockBypassRoles: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

type IModerationConfig = InferSchemaType<typeof ModerationConfigSchema>;

const ModerationConfig = (mongoose.models.ModerationConfig || model<IModerationConfig>("ModerationConfig", ModerationConfigSchema)) as Model<IModerationConfig>;

export default ModerationConfig;
export type { IModerationConfig };
export { EscalationTierSchema };
