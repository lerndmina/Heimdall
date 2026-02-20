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

    /** Plain text content — used as embed description when useEmbed is true */
    content: { type: String, required: true, maxlength: 2000 },

    /** Whether to send as an embed (true) or plain text (false) */
    useEmbed: { type: Boolean, default: false },

    /** Embed title */
    embedTitle: { type: String, default: null, maxlength: 256 },

    /** Embed colour (decimal integer) */
    color: { type: Number, default: 0 },

    /** Embed image URL */
    embedImage: { type: String, default: null, maxlength: 2048 },

    /** Embed thumbnail URL */
    embedThumbnail: { type: String, default: null, maxlength: 2048 },

    /** Embed footer text */
    embedFooter: { type: String, default: null, maxlength: 2048 },

    /** ID of the currently posted sticky message (for deletion on refresh) */
    currentMessageId: { type: String, default: null },

    /** Who created / last updated the sticky */
    moderatorId: { type: String, required: true },

    /** Whether the sticky is currently active */
    enabled: { type: Boolean, default: true },

    /**
     * Detection behavior: "instant" deletes-and-resends immediately,
     * "delay" waits for a conversation to end before resending.
     */
    detectionBehavior: {
      type: String,
      enum: ["instant", "delay"],
      default: "instant",
    },

    /** Seconds to wait after the last message before resending (delay mode) */
    detectionDelay: { type: Number, default: 5 },

    /** How long (seconds) of inactivity before a conversation is considered ended */
    conversationDuration: { type: Number, default: 10 },

    /**
     * When to delete the old sticky:
     * "immediate" — delete as soon as a new message arrives
     * "after_conversation" — delete and resend only after conversation ends
     */
    conversationDeleteBehavior: {
      type: String,
      enum: ["immediate", "after_conversation"],
      default: "after_conversation",
    },

    /** Order priority when channel has multiple automations (lower = first) */
    sendOrder: { type: Number, default: 1 },
  },
  { timestamps: true },
);

StickyMessageSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export type IStickyMessage = InferSchemaType<typeof StickyMessageSchema>;

const StickyMessage = (mongoose.models.StickyMessage || model<IStickyMessage>("StickyMessage", StickyMessageSchema)) as Model<IStickyMessage>;

export default StickyMessage;
