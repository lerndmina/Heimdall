/**
 * TicketArchiveConfig Model - Per-guild archive settings
 *
 * Configuration for archiving closed tickets, including
 * archive category, expiry settings, and transcript options.
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";

/**
 * Ticket Archive Config Schema
 */
const TicketArchiveConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    // Archive Category
    archiveCategoryId: { type: String, required: true },

    // Expiry Settings
    archiveExpireDays: { type: Number, required: true, default: 30 },

    // Transcript Settings
    transcriptChannelId: { type: String },
    transcriptWebhookUrl: { type: String },
  },
  { timestamps: true }
);

// Static methods
TicketArchiveConfigSchema.statics.findByGuild = function (guildId: string) {
  return this.findOne({ guildId });
};

TicketArchiveConfigSchema.statics.getOrCreate = async function (guildId: string, archiveCategoryId: string) {
  let config = await this.findOne({ guildId });
  if (!config) {
    config = new this({ guildId, archiveCategoryId });
    await config.save();
  }
  return config;
};

// Type inference
type ITicketArchiveConfig = InferSchemaType<typeof TicketArchiveConfigSchema>;

interface ITicketArchiveConfigModel extends Model<ITicketArchiveConfig> {
  findByGuild(guildId: string): Promise<ITicketArchiveConfig | null>;
  getOrCreate(guildId: string, archiveCategoryId: string): Promise<ITicketArchiveConfig>;
}

// Hot-reload safe export
const TicketArchiveConfig = (mongoose.models.TicketArchiveConfig ||
  model<ITicketArchiveConfig, ITicketArchiveConfigModel>(
    "TicketArchiveConfig",
    TicketArchiveConfigSchema
  )) as ITicketArchiveConfigModel;

export default TicketArchiveConfig;
export type { ITicketArchiveConfig, ITicketArchiveConfigModel };
