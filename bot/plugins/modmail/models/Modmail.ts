/**
 * Modmail Model - Individual modmail conversation tracking
 *
 * Features:
 * - Complete conversation lifecycle tracking
 * - Message history with DM/thread context
 * - Form response storage from category selection
 * - Activity tracking for auto-close functionality
 * - Resolution status with configurable auto-close timers
 * - Integration with transcript generation
 * - Staff assignment and claiming
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import { nanoid } from "nanoid";

/**
 * Modmail status enum
 */
export enum ModmailStatus {
  OPEN = "open",
  RESOLVED = "resolved",
  CLOSED = "closed",
}

/**
 * Message context enum (DM vs thread)
 */
export enum MessageContext {
  DM = "dm", // Message sent to user's DM
  THREAD = "thread", // Message sent to staff thread
  BOTH = "both", // Message sent to both (via webhook relay)
}

/**
 * Message type enum
 */
export enum MessageType {
  USER = "user", // Message from the user
  STAFF = "staff", // Message from staff
  SYSTEM = "system", // System-generated message (auto-close warnings, etc.)
}

/**
 * Form response interface
 */
export interface FormResponse {
  fieldId: string;
  fieldLabel: string;
  fieldType: "short" | "paragraph" | "select" | "number";
  value: string;
}

/**
 * Form response schema for category form data
 */
const FormResponseSchema = new Schema<FormResponse>(
  {
    fieldId: {
      type: String,
      required: true,
    },
    fieldLabel: {
      type: String,
      required: true,
    },
    fieldType: {
      type: String,
      enum: ["short", "paragraph", "select", "number"],
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

/**
 * Message attachment interface
 */
export interface MessageAttachment {
  discordId?: string;
  filename: string;
  url: string;
  proxyUrl?: string;
  size?: number;
  contentType?: string;
  spoiler: boolean;
}

/**
 * Modmail message interface
 */
export interface ModmailMessage {
  messageId: string;
  discordMessageId?: string;
  discordDmMessageId?: string;
  authorId: string;
  authorType: MessageType;
  context: MessageContext;
  content?: string;
  isStaffOnly: boolean;
  attachments: MessageAttachment[];
  embedData?: unknown;
  timestamp: Date;
  isEdited: boolean;
  editedAt?: Date;
  originalContent?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deliveredToDm: boolean;
  deliveredToThread: boolean;
  deliveryError?: string;
}

/**
 * Message schema for conversation history
 */
const ModmailMessageSchema = new Schema<ModmailMessage>(
  {
    messageId: {
      type: String,
      required: true,
      default: () => nanoid(14),
    },

    // Discord message IDs (can be null if message failed to send)
    discordMessageId: {
      type: String,
    },
    discordDmMessageId: {
      type: String,
    },

    // Message metadata
    authorId: {
      type: String,
      required: true,
    },
    authorType: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
    },
    context: {
      type: String,
      enum: Object.values(MessageContext),
      required: true,
    },

    // Message content
    content: {
      type: String,
    },
    isStaffOnly: {
      type: Boolean,
      default: false,
    },

    // Attachments
    attachments: [
      {
        discordId: { type: String },
        filename: { type: String, required: true },
        url: { type: String, required: true },
        proxyUrl: { type: String },
        size: { type: Number },
        contentType: { type: String },
        spoiler: { type: Boolean, default: false },
      },
    ],

    // Embeds (for system messages, staff notifications, etc.)
    embedData: {
      type: Schema.Types.Mixed,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Edit tracking
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    originalContent: {
      type: String,
    },

    // Deletion tracking
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: String,
    },

    // Delivery status
    deliveredToDm: {
      type: Boolean,
      default: false,
    },
    deliveredToThread: {
      type: Boolean,
      default: false,
    },
    deliveryError: {
      type: String,
    },
  },
  { _id: false },
);

/**
 * Modmail transcript interface
 */
export interface ModmailTranscript {
  transcriptId: string;
  generatedAt: Date;
  closedBy: string;
  messageCount: number;
  staffOnlyMessageCount: number;
  r2Key: string;
  r2Url: string;
  contentSize?: number;
  dmSent: boolean;
  channelSaved: boolean;
  generationError?: string;
}

/**
 * Transcript metadata schema
 */
const ModmailTranscriptSchema = new Schema<ModmailTranscript>(
  {
    transcriptId: {
      type: String,
      required: true,
      default: () => nanoid(16),
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    closedBy: {
      type: String,
      required: true,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    staffOnlyMessageCount: {
      type: Number,
      default: 0,
    },

    // R2 Storage
    r2Key: {
      type: String,
      required: true,
    },
    r2Url: {
      type: String,
      required: true,
    },
    contentSize: {
      type: Number,
    },

    // Delivery status
    dmSent: {
      type: Boolean,
      default: false,
    },
    channelSaved: {
      type: Boolean,
      default: false,
    },
    generationError: {
      type: String,
    },
  },
  { _id: false },
);

/**
 * Modmail metrics interface
 */
export interface ModmailMetrics {
  totalMessages: number;
  userMessages: number;
  staffMessages: number;
  systemMessages: number;
  staffOnlyMessages: number;
  totalAttachments: number;
  firstStaffResponseTime?: number;
  averageResponseTime?: number;
  totalResponseTime: number;
  responseCount: number;
}

/**
 * Main modmail schema
 */
const ModmailSchema = new Schema(
  {
    // Persistent identifiers
    modmailId: {
      type: String,
      required: true,
      unique: true,
      default: () => nanoid(16),
      index: true,
    },

    ticketNumber: {
      type: Number,
      required: true,
    },

    // Guild and user information
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

    // Discord channel information
    forumChannelId: {
      type: String,
      required: true,
    },
    forumThreadId: {
      type: String,
      required: true,
      unique: true,
    },

    // Category information
    categoryId: {
      type: String,
    },
    categoryName: {
      type: String,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },

    // Form responses from category selection
    formResponses: [FormResponseSchema],

    // Status and lifecycle
    status: {
      type: String,
      enum: Object.values(ModmailStatus),
      default: ModmailStatus.OPEN,
      index: true,
    },

    // Staff assignment
    claimedBy: {
      type: String,
    },
    claimedAt: {
      type: Date,
    },

    // Resolution tracking
    markedResolvedBy: {
      type: String,
    },
    markedResolvedAt: {
      type: Date,
    },
    resolveAutoCloseAt: {
      type: Date,
    },

    // Closure tracking
    closedBy: {
      type: String,
    },
    closedAt: {
      type: Date,
    },
    closeReason: {
      type: String,
    },

    // Activity tracking for auto-close
    lastUserActivityAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastStaffActivityAt: {
      type: Date,
      index: true,
    },

    // Auto-close scheduling
    autoCloseScheduledAt: {
      type: Date,
    },
    autoCloseWarningAt: {
      type: Date,
    },
    autoCloseDisabled: {
      type: Boolean,
      default: false,
    },

    // User information (cached for performance and historical context)
    userDisplayName: {
      type: String,
      required: true,
    },
    userAvatarUrl: {
      type: String,
    },

    // Creation context
    createdVia: {
      type: String,
      enum: ["dm", "command", "button", "api"],
      default: "dm",
    },

    // Message history
    messages: [ModmailMessageSchema],

    // Transcript metadata
    transcripts: [ModmailTranscriptSchema],

    // Metrics for analytics
    metrics: {
      totalMessages: { type: Number, default: 0 },
      userMessages: { type: Number, default: 0 },
      staffMessages: { type: Number, default: 0 },
      systemMessages: { type: Number, default: 0 },
      staffOnlyMessages: { type: Number, default: 0 },
      totalAttachments: { type: Number, default: 0 },
      firstStaffResponseTime: { type: Number },
      averageResponseTime: { type: Number },
      totalResponseTime: { type: Number, default: 0 },
      responseCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
ModmailSchema.index({ guildId: 1, status: 1 }); // List open/closed modmails per guild
ModmailSchema.index({ userId: 1, status: 1 }); // Check user's open modmails
ModmailSchema.index({ claimedBy: 1 }); // Staff workload
ModmailSchema.index({ autoCloseScheduledAt: 1 }); // Auto-close processing
ModmailSchema.index({ lastUserActivityAt: 1 }); // Inactivity tracking
ModmailSchema.index({ createdAt: 1 }); // Analytics and sorting

// Compound indexes
ModmailSchema.index({ guildId: 1, categoryId: 1 }); // Category analytics
ModmailSchema.index({ guildId: 1, createdAt: -1 }); // Recent modmails per guild

/**
 * Add a message to the modmail and update metrics
 */
ModmailSchema.methods.addMessage = function (messageData: Partial<ModmailMessage>): void {
  this.messages.push(messageData);

  // Update metrics
  this.metrics.totalMessages += 1;

  switch (messageData.authorType) {
    case MessageType.USER:
      this.metrics.userMessages += 1;
      this.lastUserActivityAt = new Date();
      break;
    case MessageType.STAFF:
      this.metrics.staffMessages += 1;
      this.lastStaffActivityAt = new Date();

      if (messageData.isStaffOnly) {
        this.metrics.staffOnlyMessages += 1;
      }
      break;
    case MessageType.SYSTEM:
      this.metrics.systemMessages += 1;
      break;
  }

  if (messageData.attachments && messageData.attachments.length > 0) {
    this.metrics.totalAttachments += messageData.attachments.length;
  }
};

/**
 * Check if modmail can be auto-closed based on inactivity
 */
ModmailSchema.methods.canAutoClose = function (autoCloseHours: number): boolean {
  if (this.status !== ModmailStatus.OPEN) {
    return false;
  }

  if (this.autoCloseDisabled) {
    return false;
  }

  const inactiveTime = Date.now() - this.lastUserActivityAt.getTime();
  const inactiveHours = inactiveTime / (1000 * 60 * 60);

  return inactiveHours >= autoCloseHours;
};

/**
 * Generate thread name based on pattern
 */
ModmailSchema.methods.generateThreadName = function (pattern: string, claimerName?: string): string {
  const name = pattern
    .replace("{number}", this.ticketNumber.toString())
    .replace("{username}", this.userDisplayName)
    .replace("{claimer}", claimerName || "unknown")
    .replace("{category}", this.categoryName || "general");

  // Discord forum post title limit is 100 characters
  const MAX_LENGTH = 100;
  if (Array.from(name).length <= MAX_LENGTH) {
    return name;
  }

  // Truncate and add ellipsis
  const chars = Array.from(name);
  return chars.slice(0, MAX_LENGTH - 1).join("") + "…";
};

/**
 * Check if user has an open modmail in guild
 */
ModmailSchema.statics.userHasOpenModmail = async function (guildId: string, userId: string): Promise<boolean> {
  const existing = await this.findOne({
    guildId,
    userId,
    status: ModmailStatus.OPEN,
  });

  return !!existing;
};

/**
 * Check if user has a blocking modmail in guild based on duplicate policy
 */
ModmailSchema.statics.userHasBlockingModmail = async function (guildId: string, userId: string, policy: "open-only" | "open-or-resolved"): Promise<boolean> {
  const statuses = policy === "open-or-resolved" ? [ModmailStatus.OPEN, ModmailStatus.RESOLVED] : [ModmailStatus.OPEN];

  const existing = await this.findOne({
    guildId,
    userId,
    status: { $in: statuses },
  });

  return !!existing;
};

/**
 * Find modmail by forum thread ID (for channel context detection)
 */
ModmailSchema.statics.findByThreadId = async function (forumThreadId: string): Promise<IModmail | null> {
  return this.findOne({ forumThreadId, status: { $ne: ModmailStatus.CLOSED } });
};

// Infer TypeScript type from schema
type IModmail = InferSchemaType<typeof ModmailSchema>;

// Interface for static methods
interface IModmailModel extends Model<IModmail> {
  userHasOpenModmail(guildId: string, userId: string): Promise<boolean>;
  userHasBlockingModmail(guildId: string, userId: string, policy: "open-only" | "open-or-resolved"): Promise<boolean>;
  findByThreadId(forumThreadId: string): Promise<IModmail | null>;
}

// Export model with hot-reload safety
const Modmail = (mongoose.models.Modmail || model<IModmail, IModmailModel>("Modmail", ModmailSchema)) as IModmailModel;

export default Modmail;
export type { IModmail, IModmailModel };
