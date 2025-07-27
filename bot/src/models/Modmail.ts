import { InferSchemaType, Schema, model } from "mongoose";
import FetchEnvs from "../utils/FetchEnvs";
import { TicketPriority } from "./ModmailConfig";
const env = FetchEnvs();

const modmailMessageSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["user", "staff"],
    },
    content: {
      type: String,
      required: true,
    },
    authorId: {
      type: String,
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    authorAvatar: {
      type: String,
      required: false,
    },
    // Discord message references
    discordMessageId: {
      type: String,
      required: false,
    },
    discordMessageUrl: {
      type: String,
      required: false,
    },
    webhookMessageId: {
      type: String,
      required: false,
    },
    webhookMessageUrl: {
      type: String,
      required: false,
    },
    dmMessageId: {
      type: String,
      required: false,
    },
    dmMessageUrl: {
      type: String,
      required: false,
    },
    // Message metadata
    attachments: [
      {
        filename: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
          required: true,
        },
        contentType: {
          type: String,
          required: false,
        },
      },
    ],
    // Editing tracking
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedContent: {
      type: String,
      required: false,
    },
    editedAt: {
      type: Date,
      required: false,
    },
    editedBy: {
      type: String,
      required: false,
    },
    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // Internal flags
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      required: false,
    },
    deletedBy: {
      type: String,
      required: false,
    },
  },
  { _id: false }
); // Disable _id for subdocuments

const formResponseSchema = new Schema(
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
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const modmailSchema = new Schema({
  guildId: {
    type: String,
    required: true,
    index: true, // Index for faster guild-based queries
  },
  forumThreadId: {
    type: String,
    required: true,
    index: true, // Index for thread lookups
  },
  forumChannelId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
    index: true, // Index for user-based queries
  },
  userAvatar: {
    type: String,
    required: false,
  },
  userDisplayName: {
    type: String,
    required: false,
  },

  // Category information
  categoryId: {
    type: String,
    required: false, // Optional for backward compatibility
    index: true, // Index for category-based queries
  },
  categoryName: {
    type: String,
    required: false,
  },
  ticketNumber: {
    type: Number,
    required: false, // Optional for backward compatibility
    index: true, // Index for ticket number lookups
  },
  priority: {
    type: Number,
    enum: [1, 2, 3, 4], // Only numeric values, not the string keys
    default: TicketPriority.MEDIUM,
    index: true, // Index for priority-based queries
  },

  // Form response data
  formResponses: {
    type: [formResponseSchema],
    default: [],
  },

  // Enhanced metadata
  createdVia: {
    type: String,
    enum: ["dm", "command", "button", "api"],
    default: "dm",
  },
  initialQuery: {
    type: String,
    required: false, // User's original message before form
  },

  lastUserActivityAt: {
    type: Date,
    default: Date.now,
    index: true, // Index for activity-based queries
  },
  inactivityNotificationSent: {
    type: Date,
    required: false,
  },
  autoCloseScheduledAt: {
    type: Date,
    required: false,
    index: true, // Index for scheduled operations
  },
  autoCloseDisabled: {
    type: Boolean,
    default: false,
  },
  markedResolved: {
    type: Boolean,
    default: false,
    index: true, // Index for resolution status queries
  },
  resolvedAt: {
    type: Date,
    required: false,
  },
  claimedBy: {
    type: String,
    required: false,
  },
  claimedAt: {
    type: Date,
    required: false,
  },
  // Thread closure tracking
  isClosed: {
    type: Boolean,
    default: false,
    index: true, // Index for filtering open/closed threads
  },
  closedAt: {
    type: Date,
    required: false,
  },
  closedBy: {
    type: String,
    required: false,
  },
  closedReason: {
    type: String,
    required: false,
  },
  // New messages array for tracking all messages
  messages: {
    type: [modmailMessageSchema],
    default: [],
  },
});

// Compound indexes for better query performance
modmailSchema.index({ guildId: 1, userId: 1 }); // Guild-user combination
modmailSchema.index({ userId: 1, lastUserActivityAt: -1 }); // User activity
modmailSchema.index({ guildId: 1, markedResolved: 1 }); // Guild resolution status
modmailSchema.index({ guildId: 1, isClosed: 1 }); // Guild open/closed status
modmailSchema.index({ autoCloseScheduledAt: 1, autoCloseDisabled: 1 }); // Auto-close scheduling
modmailSchema.index({ guildId: 1, categoryId: 1 }); // Category-based queries
modmailSchema.index({ guildId: 1, ticketNumber: 1 }); // Ticket number lookups
modmailSchema.index({ guildId: 1, priority: 1, isClosed: 1 }); // Priority-based filtering

export default model(env.MODMAIL_TABLE, modmailSchema);

export type ModmailType = InferSchemaType<typeof modmailSchema>;
export type ModmailMessageType = InferSchemaType<typeof modmailMessageSchema>;
export type FormResponseType = InferSchemaType<typeof formResponseSchema>;
