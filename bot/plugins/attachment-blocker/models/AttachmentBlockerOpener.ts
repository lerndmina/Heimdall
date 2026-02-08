/**
 * AttachmentBlockerOpener Model — Attachment blocking rules keyed by TempVC opener channel.
 *
 * When a temp VC is spawned from an opener, it inherits this opener's attachment rules.
 * This allows rules to persist across temp VC lifetimes without writing/deleting per-channel
 * overrides every time a temp VC is created or destroyed.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { AttachmentType } from "../utils/attachment-types.js";

const validTypes = Object.values(AttachmentType);

const AttachmentBlockerOpenerSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    /** The TempVC opener (creator) channel ID */
    openerChannelId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /** Attachment types allowed in temp VCs spawned by this opener */
    allowedTypes: {
      type: [{ type: String, enum: validTypes }],
      default: undefined,
    },
    /** Timeout duration in ms for violations (undefined = inherit guild default) */
    timeoutDuration: {
      type: Number,
      default: undefined,
    },
    /** Whether this opener override is active */
    enabled: {
      type: Boolean,
      default: true,
    },
    /** Who created this config */
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

type IAttachmentBlockerOpener = InferSchemaType<typeof AttachmentBlockerOpenerSchema>;

const AttachmentBlockerOpener = (mongoose.models.AttachmentBlockerOpener ||
  model<IAttachmentBlockerOpener>("AttachmentBlockerOpener", AttachmentBlockerOpenerSchema)) as Model<IAttachmentBlockerOpener>;

export default AttachmentBlockerOpener;
export type { IAttachmentBlockerOpener };
