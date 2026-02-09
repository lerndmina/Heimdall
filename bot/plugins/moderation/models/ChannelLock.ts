/**
 * ChannelLock Model — Tracks locked channels with permission snapshots.
 *
 * Stores the original permission overwrites so they can be restored
 * when the lock expires or is manually removed. Also tracks the sticky
 * message ID so it can be kept at the bottom of the channel.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

// ── Permission Snapshot Subdocument ──────────────────────

const PermissionOverwriteSchema = new Schema(
  {
    /** Role or user ID */
    id: { type: String, required: true },
    /** 0 = role, 1 = member */
    type: { type: Number, required: true, enum: [0, 1] },
    /** Bitfield string of allowed permissions */
    allow: { type: String, required: true },
    /** Bitfield string of denied permissions */
    deny: { type: String, required: true },
  },
  { _id: false },
);

// ── Main Schema ──────────────────────────────────────────

const ChannelLockSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Moderator who locked the channel */
    moderatorId: {
      type: String,
      required: true,
    },
    /** Reason displayed in the sticky message */
    reason: {
      type: String,
      default: "No reason provided",
    },
    /** Snapshot of permission overwrites before lock was applied */
    previousOverwrites: {
      type: [PermissionOverwriteSchema],
      default: [],
    },
    /** Whether the channel was synced with its parent category before lock */
    wasSyncedWithParent: {
      type: Boolean,
      default: false,
    },
    /** The sticky message ID in the locked channel */
    stickyMessageId: {
      type: String,
      default: null,
    },
    /** When the lock automatically expires (null = indefinite) */
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Compound index for guild lookups
ChannelLockSchema.index({ guildId: 1, channelId: 1 });
ChannelLockSchema.index({ expiresAt: 1 }, { sparse: true });

type IChannelLock = InferSchemaType<typeof ChannelLockSchema>;

const ChannelLock = (mongoose.models.ChannelLock || model<IChannelLock>("ChannelLock", ChannelLockSchema)) as Model<IChannelLock>;

export default ChannelLock;
export type { IChannelLock };
