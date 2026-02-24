/**
 * StarboardConfig Model — Per-guild starboard board configuration.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { HydratedDocument, InferSchemaType } from "mongoose";

const StarboardBoardSchema = new Schema(
  {
    boardId: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    channelId: {
      type: String,
      required: true,
    },
    threshold: {
      type: Number,
      default: 3,
      min: 1,
      max: 100,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    selfStar: {
      type: Boolean,
      default: false,
    },
    removeOnUnreact: {
      type: Boolean,
      default: true,
    },
    ignoredChannelIds: {
      type: [String],
      default: [],
    },
    ignoredRoleIds: {
      type: [String],
      default: [],
    },
    requiredRoleIds: {
      type: [String],
      default: [],
    },
    allowNSFW: {
      type: Boolean,
      default: false,
    },
    maxMessageAgeDays: {
      type: Number,
      default: 0,
      min: 0,
      max: 365,
    },
    autoLockThreshold: {
      type: Number,
      default: 0,
      min: 0,
      max: 1000,
    },
    moderationEnabled: {
      type: Boolean,
      default: false,
    },
    moderationChannelId: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const StarboardConfigSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    boards: {
      type: [StarboardBoardSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type IStarboardConfig = InferSchemaType<typeof StarboardConfigSchema>;
export type IStarboardBoard = InferSchemaType<typeof StarboardBoardSchema>;
export type StarboardConfigDocument = HydratedDocument<IStarboardConfig>;

const StarboardConfigModel = (mongoose.models.StarboardConfig || model("StarboardConfig", StarboardConfigSchema)) as Model<IStarboardConfig>;

export default StarboardConfigModel;
