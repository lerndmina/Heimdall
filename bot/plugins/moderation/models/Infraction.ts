/**
 * Infraction Model — Unified infraction log for both automod and manual actions.
 *
 * Records every moderation action (warn, kick, ban, mute, automod triggers)
 * with points tracking, decay support, and full context.
 */

import mongoose, { Schema, model, type Model, type Types } from "mongoose";
import type { InferSchemaType } from "mongoose";

// ── Enums ────────────────────────────────────────────────

export enum InfractionSource {
  AUTOMOD = "automod",
  MANUAL = "manual",
}

export enum InfractionType {
  WARN = "warn",
  KICK = "kick",
  BAN = "ban",
  MUTE = "mute",
  AUTOMOD_DELETE = "automod_delete",
  AUTOMOD_REACTION = "automod_reaction",
  AUTOMOD_USERNAME = "automod_username",
  ESCALATION = "escalation",
}

// ── Schema ───────────────────────────────────────────────

const InfractionSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    /** Moderator who issued (null for automod) */
    moderatorId: {
      type: String,
      default: null,
    },
    /** Origin of the infraction */
    source: {
      type: String,
      enum: Object.values(InfractionSource),
      required: true,
    },
    /** Type of moderation action */
    type: {
      type: String,
      enum: Object.values(InfractionType),
      required: true,
    },
    /** Human-readable reason */
    reason: {
      type: String,
      default: null,
    },
    /** Triggering automod rule ID */
    ruleId: {
      type: Schema.Types.ObjectId,
      ref: "AutomodRule",
      default: null,
    },
    /** Denormalized rule name for display */
    ruleName: {
      type: String,
      default: null,
    },
    /** Content that matched */
    matchedContent: {
      type: String,
      default: null,
    },
    /** Regex pattern that hit */
    matchedPattern: {
      type: String,
      default: null,
    },
    /** Points from this action */
    pointsAssigned: {
      type: Number,
      default: 0,
    },
    /** Running total after this infraction */
    totalPointsAfter: {
      type: Number,
      default: 0,
    },
    /** Tier name if escalation fired */
    escalationTriggered: {
      type: String,
      default: null,
    },
    /** Channel where it happened */
    channelId: {
      type: String,
      default: null,
    },
    /** Message ID */
    messageId: {
      type: String,
      default: null,
    },
    /** Timeout/mute duration in ms */
    duration: {
      type: Number,
      default: null,
    },
    /** When points expire */
    expiresAt: {
      type: Date,
      default: null,
    },
    /** Whether points are still active (manual clear sets false) */
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Compound indexes for efficient queries
InfractionSchema.index({ guildId: 1, userId: 1 });
InfractionSchema.index({ guildId: 1, userId: 1, active: 1 });
InfractionSchema.index({ expiresAt: 1 }, { sparse: true });

type IInfraction = InferSchemaType<typeof InfractionSchema>;

const Infraction = (mongoose.models.Infraction || model<IInfraction>("Infraction", InfractionSchema)) as Model<IInfraction>;

export default Infraction;
export type { IInfraction };
