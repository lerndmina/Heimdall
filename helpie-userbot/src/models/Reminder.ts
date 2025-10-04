/**
 * Reminder Model
 * Stores user reminders that will be sent via DM at specified time
 */

import { InferSchemaType, Schema, model } from "mongoose";

const ReminderSchema = new Schema(
  {
    reminderId: {
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
    content: {
      type: String,
      required: true,
      maxlength: 1024,
    },
    remindAt: {
      type: Date,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Optional: If reminder was created from a message
    messageUrl: {
      type: String,
      required: false,
    },
    channelId: {
      type: String,
      required: false,
    },
    messageId: {
      type: String,
      required: false,
    },
    // Guild context (if applicable)
    guildId: {
      type: String,
      required: false,
    },
    // Track completion
    completed: {
      type: Boolean,
      required: false,
      default: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export default model("Reminder", ReminderSchema);

export type ReminderType = InferSchemaType<typeof ReminderSchema>;
