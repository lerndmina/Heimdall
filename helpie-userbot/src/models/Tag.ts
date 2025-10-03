/**
 * Tag Model
 *
 * Stores reusable message tags that can be quickly sent via commands
 * Tags are user-specific and can be triggered via /helpie tag <name>
 */

import { Schema, model, Document } from "mongoose";

export interface ITag extends Document {
  // Ownership & Scope
  userId: string; // Discord user ID who owns this tag (for user tags) or who created it (for global tags)
  scope: "user" | "global"; // Whether tag is user-specific or globally available

  // Tag identification
  name: string; // Tag name (lowercase, alphanumeric + dashes/underscores only)

  // Content
  content: string; // The message content to send

  // Metadata
  createdAt: Date;
  lastModified: Date;
  usageCount: number;
  lastUsed?: Date;
}
const TagSchema = new Schema<ITag>({
  // Ownership
  userId: {
    type: String,
    required: true,
    index: true,
  },
  scope: {
    type: String,
    enum: ["user", "global"],
    required: true,
    default: "user",
    index: true,
  },

  // Tag identification
  name: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9_-]+$/,
    maxlength: 100,
  },

  // Content
  content: {
    type: String,
    required: true,
    maxlength: 2000, // Discord message limit
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  lastModified: {
    type: Date,
    default: Date.now,
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastUsed: {
    type: Date,
    required: false,
  },
});

// Compound indexes for efficient tag lookups
// For user tags: userId + name must be unique per user
TagSchema.index({ userId: 1, scope: 1, name: 1 }, { unique: true });
// For global tags: name must be unique globally
TagSchema.index(
  { scope: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: "global" },
  }
);

// Update lastModified on save
TagSchema.pre("save", function (next) {
  if (!this.isNew) {
    this.lastModified = new Date();
  }
  next();
});

export default model<ITag>("Tag", TagSchema);
