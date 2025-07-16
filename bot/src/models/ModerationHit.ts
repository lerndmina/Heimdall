import mongoose, { Schema, InferSchemaType } from "mongoose";
import { ModerationCategory, ModerationAction } from "./ModeratedChannels";

// Enum for moderation hit status
export enum ModerationHitStatus {
  PENDING = "pending", // Awaiting moderator action
  ACCEPTED = "accepted", // Moderator confirmed the AI was correct
  IGNORED = "ignored", // Moderator dismissed the AI flag as false positive
  AUTO_DELETED = "auto_deleted", // Message was automatically deleted
}

// Schema for storing AI moderation results
const ModerationHitSchema = new Schema(
  {
    // Discord IDs
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
    userId: {
      type: String,
      required: true,
      index: true,
    },

    // Message content (for analysis)
    messageContent: {
      type: String,
      required: true,
    },

    // AI moderation results
    flaggedCategories: {
      type: [String],
      enum: Object.values(ModerationCategory),
      required: true,
    },

    // Confidence scores for each category (0.0 to 1.0)
    confidenceScores: {
      type: Map,
      of: Number,
      required: true,
    },

    // Content types that were moderated
    contentTypes: {
      type: [String],
      default: ["text"],
    },

    // Moderation action status
    status: {
      type: String,
      enum: Object.values(ModerationHitStatus),
      default: ModerationHitStatus.PENDING,
      index: true,
    },

    // Moderator who took action (if any)
    moderatorId: {
      type: String,
      required: false,
    },

    // Action taken by moderator
    actionTaken: {
      type: String,
      enum: Object.values(ModerationAction),
      default: ModerationAction.REPORT,
    },

    // Notes from moderator
    moderatorNotes: {
      type: String,
      required: false,
    },

    // When moderator took action
    moderatorActionAt: {
      type: Date,
      required: false,
    },

    // Whether the original message still exists
    messageExists: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    // Add version key for optimistic concurrency control
    versionKey: "__v",
  }
);

// Compound indexes for efficient queries
ModerationHitSchema.index({ guildId: 1, createdAt: -1 });
ModerationHitSchema.index({ guildId: 1, status: 1, createdAt: -1 });
ModerationHitSchema.index({ userId: 1, createdAt: -1 });
ModerationHitSchema.index({ channelId: 1, createdAt: -1 });

// Index for analytics queries
ModerationHitSchema.index({ flaggedCategories: 1, status: 1 });
ModerationHitSchema.index({ "confidenceScores.harassment": 1, status: 1 });

export default mongoose.model("ModerationHit", ModerationHitSchema);
export type ModerationHitType = InferSchemaType<typeof ModerationHitSchema>;
