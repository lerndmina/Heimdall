/**
 * Reminder Model — Personal reminders with optional ticket/modmail context
 *
 * Stores per-user reminders with trigger times and optional context
 * linking to tickets or modmail threads for rich delivery messages.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

/**
 * Context types that a reminder can be linked to
 */
export type ReminderContextType = "ticket" | "modmail";

/**
 * Snapshot data about the context at reminder creation time
 */
const ContextDataSchema = new Schema(
  {
    ticketNumber: { type: Number },
    categoryName: { type: String },
    openedBy: { type: String },
    claimedBy: { type: String },
    userName: { type: String },
    priority: { type: Number },
  },
  { _id: false },
);

/**
 * Reminder Schema
 */
const ReminderSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    triggerAt: {
      type: Date,
      required: true,
      index: true,
    },
    triggered: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Context linking (optional — ticket or modmail)
    contextType: {
      type: String,
      enum: ["ticket", "modmail"],
      default: null,
    },
    contextId: {
      type: String,
      default: null,
    },
    contextData: {
      type: ContextDataSchema,
      default: null,
    },

    // Where the reminder was created (channel the user was in)
    sourceChannelId: {
      type: String,
    },
    // Guild name cached for DM delivery
    guildName: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for polling: untriggered reminders due now
ReminderSchema.index({ triggered: 1, triggerAt: 1 });
// User reminders (for listing)
ReminderSchema.index({ userId: 1, triggered: 1 });

type IReminder = InferSchemaType<typeof ReminderSchema>;

const Reminder = (mongoose.models.Reminder || model<IReminder>("Reminder", ReminderSchema)) as Model<IReminder>;

export default Reminder;
export type { IReminder };
