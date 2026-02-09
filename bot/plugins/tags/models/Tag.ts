/**
 * Tag Model — Guild-specific text tags
 *
 * Users can create custom tags (shortcuts) to send pre-defined messages.
 * Tags are guild-specific and support autocomplete search.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const TagSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 32,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    createdBy: {
      type: String,
      required: true,
    },
    uses: {
      type: Number,
      default: 0,
    },
    /** Whether this tag is registered as a standalone slash command in the guild */
    registerAsSlashCommand: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index: one tag name per guild
TagSchema.index({ guildId: 1, name: 1 }, { unique: true });

type ITag = InferSchemaType<typeof TagSchema>;

const Tag = (mongoose.models.Tag || model<ITag>("Tag", TagSchema)) as Model<ITag>;

export default Tag;
export type { ITag };
