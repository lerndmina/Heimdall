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
  },
  {
    timestamps: true,
  },
);

export type IWelcomeMessage = InferSchemaType<typeof WelcomeMessageSchema>;

const WelcomeMessageModel = (mongoose.models.WelcomeMessage || model("WelcomeMessage", WelcomeMessageSchema)) as Model<IWelcomeMessage>;

export default WelcomeMessageModel;
