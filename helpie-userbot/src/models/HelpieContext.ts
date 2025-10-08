/**
 * HelpieContext Model
 *
 * Stores GitHub URL references for contextual information used by the AI.
 * Supports three scopes: global, guild-specific, and user-specific.
 * Only one context per scope type is allowed.
 */

import { Schema, model, Document } from "mongoose";

export interface IHelpieContext extends Document {
  // Identification
  name?: string; // Optional friendly name

  // Scope (determines uniqueness)
  scope: "global" | "guild" | "user";
  targetUserId?: string; // For user scope only
  targetGuildId?: string; // For guild scope only

  // Source (GitHub URL only)
  githubUrl: string;

  // Metadata
  uploadedBy: string; // User ID who created it
  uploadedAt: Date;
  lastModified: Date;

  // Stats (calculated on fetch)
  characterCount?: number;
  wordCount?: number;

  // Usage tracking
  usageCount: number;
  lastUsed?: Date;

  // Embedding status (for vector embeddings)
  isProcessed: boolean; // Has content been chunked/embedded?
  processingError?: string; // Error message if processing failed
  chunkCount: number; // Total chunks created
  lastProcessed?: Date; // When embeddings were last generated
  contentHash: string; // SHA-256 of fetched content (for change detection)
}

const HelpieContextSchema = new Schema<IHelpieContext>({
  // Identification
  name: {
    type: String,
    required: false,
  },

  // Scope (determines uniqueness)
  scope: {
    type: String,
    enum: ["global", "guild", "user"],
    required: true,
    index: true,
  },
  targetUserId: {
    type: String,
    index: true,
  },
  targetGuildId: {
    type: String,
    index: true,
  },

  // Source (GitHub URL only)
  githubUrl: {
    type: String,
    required: true,
  },

  // Metadata
  uploadedBy: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  lastModified: {
    type: Date,
    default: Date.now,
  },

  // Stats (calculated on fetch)
  characterCount: {
    type: Number,
  },
  wordCount: {
    type: Number,
  },

  // Usage tracking
  usageCount: {
    type: Number,
    default: 0,
  },
  lastUsed: {
    type: Date,
  },

  // Embedding status (for vector embeddings)
  isProcessed: {
    type: Boolean,
    default: false,
    index: true,
  },
  processingError: {
    type: String,
  },
  chunkCount: {
    type: Number,
    default: 0,
  },
  lastProcessed: {
    type: Date,
  },
  contentHash: {
    type: String,
    default: "",
  },
});

// Unique indexes (only 1 context per scope)
// For global scope - only one document allowed
HelpieContextSchema.index(
  { scope: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: "global" },
  }
);

// For user scope - one per user
HelpieContextSchema.index(
  { scope: 1, targetUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: "user", targetUserId: { $exists: true } },
  }
);

// For guild scope - one per guild
HelpieContextSchema.index(
  { scope: 1, targetGuildId: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: "guild", targetGuildId: { $exists: true } },
  }
);

export default model<IHelpieContext>("HelpieContext", HelpieContextSchema);
