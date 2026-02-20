/**
 * CensusStatus — Per-guild Census/Honu API health tracking
 *
 * Tracks the online/offline status of the Census and Honu APIs
 * with hysteresis (consecutive failure/success thresholds) to avoid
 * flapping on transient errors.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const ApiHealthSchema = new Schema(
  {
    online: { type: Boolean, default: true },
    lastChange: { type: Number, default: Date.now },
    lastChecked: { type: Date },
    consecutiveFailures: { type: Number, default: 0 },
    consecutiveSuccesses: { type: Number, default: 0 },
  },
  { _id: false },
);

const CensusStatusSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    // Nested API health trackers
    census: { type: ApiHealthSchema, default: () => ({}) },
    honu: { type: ApiHealthSchema, default: () => ({}) },

    // Status message
    statusMessageId: { type: String },
    statusChannelId: { type: String },
    channelId: { type: String },
  },
  { timestamps: true },
);

export type ICensusStatus = InferSchemaType<typeof CensusStatusSchema>;

const CensusStatus = (mongoose.models.CensusStatus || model("CensusStatus", CensusStatusSchema)) as Model<ICensusStatus>;

export default CensusStatus;
