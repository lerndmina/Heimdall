/**
 * BotActivityModel — Singleton document (_id: "global") that persists the
 * bot's activity/presence configuration across restarts.
 *
 * Stores:
 *  - presets      : named activity presets (type + text + optional URL)
 *  - activePresetId: the preset currently applied (null = none)
 *  - status       : Discord presence status (online/idle/dnd/invisible)
 *  - rotation     : interval-based rotation config
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const PresetSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    /** discord.js ActivityType enum value (0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom, 5=Competing) */
    type: { type: Number, required: true },
    /** Activity text. For Custom type, this becomes the "state" field. */
    text: { type: String, required: true },
    /** Streaming URL — only used when type === ActivityType.Streaming */
    url: { type: String, default: undefined },
  },
  { _id: false },
);

const RotationSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    intervalSeconds: { type: Number, default: 60 },
    /** In-memory only — currentIndex is not restored on restart, rotation always starts at 0 */
    currentIndex: { type: Number, default: 0 },
  },
  { _id: false },
);

const BotActivitySchema = new Schema({
  _id: { type: String },
  presets: { type: [PresetSchema], default: [] },
  activePresetId: { type: String, default: null },
  status: { type: String, default: "online", enum: ["online", "idle", "dnd", "invisible"] },
  rotation: { type: RotationSchema, default: () => ({}) },
});

export type BotActivityPreset = InferSchemaType<typeof PresetSchema>;
export type BotActivityConfig = InferSchemaType<typeof BotActivitySchema>;

const BotActivityModel = (mongoose.models["BotActivity"] || model<BotActivityConfig>("BotActivity", BotActivitySchema)) as Model<BotActivityConfig>;

export default BotActivityModel;
