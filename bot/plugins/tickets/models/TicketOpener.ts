/**
 * TicketOpener Model - Ticket opener message configurations
 *
 * Customizable messages with buttons/dropdowns for opening tickets.
 * Each opener can reference multiple categories.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";
import { OpenerUIType, MAX_OPENER_CATEGORIES } from "../types/index.js";

/**
 * Ticket Opener Schema
 */
const TicketOpenerSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },

    // Display
    name: { type: String, required: true },
    messageId: { type: String },
    channelId: { type: String },

    // Embed Configuration
    embedTitle: { type: String, required: true },
    embedDescription: { type: String, required: true },
    embedColor: { type: Number },
    embedImage: { type: String },
    embedThumbnail: { type: String },

    // Component Configuration
    uiType: { type: String, enum: Object.values(OpenerUIType), required: true },
    categoryIds: {
      type: [String],
      required: true,
      default: [],
      validate: [
        (v: string[]) => v.length <= MAX_OPENER_CATEGORIES,
        `Maximum ${MAX_OPENER_CATEGORIES} categories`,
      ],
    },

    // Metadata
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

// Indexes
TicketOpenerSchema.index({ guildId: 1, name: 1 }, { unique: true });
TicketOpenerSchema.index({ messageId: 1 });
TicketOpenerSchema.index({ channelId: 1 });

// Static methods
TicketOpenerSchema.statics.findByMessage = function (messageId: string) {
  return this.findOne({ messageId });
};

TicketOpenerSchema.statics.findByGuild = function (guildId: string) {
  return this.find({ guildId });
};

// Type inference
type ITicketOpener = InferSchemaType<typeof TicketOpenerSchema>;

interface ITicketOpenerModel extends Model<ITicketOpener> {
  findByMessage(messageId: string): Promise<ITicketOpener | null>;
  findByGuild(guildId: string): Promise<ITicketOpener[]>;
}

// Hot-reload safe export
const TicketOpener = (mongoose.models.TicketOpener ||
  model<ITicketOpener, ITicketOpenerModel>("TicketOpener", TicketOpenerSchema)) as ITicketOpenerModel;

export default TicketOpener;
export type { ITicketOpener, ITicketOpenerModel };
