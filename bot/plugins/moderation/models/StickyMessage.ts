/**
 * StickyMessage — Per-channel sticky message configuration.
 *
 * A sticky message is re-posted at the bottom of a channel every time
 * a new message is sent, keeping it always visible.  One per channel.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";

const StickyMessageSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, unique: true },

    /** Plain text content of the sticky message */
    content: { type: String, required: true, maxlength: 2000 },

    /** Optional embed colour (decimal) — 0 means no embed, just plain text */
    color: { type: Number, default: 0 },

    /** ID of the currently posted sticky message (for deletion on refresh) */
    currentMessageId: { type: String, default: null },

    /** Who created / last updated the sticky */
    moderatorId: { type: String, required: true },

    /** Whether the sticky is currently active */
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

StickyMessageSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export type IStickyMessage = InferSchemaType<typeof StickyMessageSchema>;

const StickyMessage = (mongoose.models.StickyMessage || model<IStickyMessage>("StickyMessage", StickyMessageSchema)) as Model<IStickyMessage>;

export default StickyMessage;
