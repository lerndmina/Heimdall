/**
 * ActiveTempChannels Model - Tracks currently active temporary voice channels
 *
 * Used to determine which channels should be cleaned up when users leave.
 * Cleanup runs regardless of feature state to prevent orphaned channels.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const ActiveTempChannelsSchema = new Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  channelIds: {
    type: [String],
    default: [],
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ActiveTempChannelsSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

type IActiveTempChannels = InferSchemaType<typeof ActiveTempChannelsSchema>;

const ActiveTempChannels = (mongoose.models.ActiveTempChannels || model<IActiveTempChannels>("ActiveTempChannels", ActiveTempChannelsSchema)) as Model<IActiveTempChannels>;

export default ActiveTempChannels;
export type { IActiveTempChannels };
