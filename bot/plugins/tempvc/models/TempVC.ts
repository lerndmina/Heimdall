/**
 * TempVC Model - Configuration for temporary voice channel creators
 *
 * Stores which voice channels act as "creators" that spawn temporary VCs
 * when users join them. Each guild can have multiple creator channels.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const TempVCSchema = new Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  channels: [
    {
      channelId: {
        type: String,
        required: true,
      },
      categoryId: {
        type: String,
        required: true,
      },
      useSequentialNames: {
        type: Boolean,
        default: false,
      },
      channelName: {
        type: String,
        default: "Temp VC",
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

TempVCSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

type ITempVC = InferSchemaType<typeof TempVCSchema>;

const TempVC = (mongoose.models.TempVC || model<ITempVC>("TempVC", TempVCSchema)) as Model<ITempVC>;

export default TempVC;
export type { ITempVC };
