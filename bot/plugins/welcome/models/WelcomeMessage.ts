/**
 * WelcomeMessage Model — Stores per-guild welcome message configuration
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const WelcomeMessageSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // Embed fields (all optional — when none set, message is sent as plain text)
    useEmbed: {
      type: Boolean,
      default: false,
    },
    embedTitle: {
      type: String,
      maxlength: 256,
    },
    embedColor: {
      type: Number,
    },
    embedImage: {
      type: String,
      maxlength: 2048,
    },
    embedThumbnail: {
      type: String,
      maxlength: 2048,
    },
    embedFooter: {
      type: String,
      maxlength: 2048,
    },
  },
  {
    timestamps: true,
  },
);

export type IWelcomeMessage = InferSchemaType<typeof WelcomeMessageSchema>;

const WelcomeMessageModel = (mongoose.models.WelcomeMessage || model("WelcomeMessage", WelcomeMessageSchema)) as Model<IWelcomeMessage>;

export default WelcomeMessageModel;
