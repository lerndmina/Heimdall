/**
 * McServerStatus — Tracks Minecraft servers for status monitoring
 *
 * Each record represents a MC server being monitored in a guild.
 * Optional persistData enables auto-updating embeds in a channel.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const MessagePersistSchema = new Schema(
  {
    messageId: { type: String, required: true },
    channelId: { type: String, required: true },
    updateInterval: { type: Number, required: true, default: 61000 },
    lastUpdate: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const McServerStatusSchema = new Schema({
  id: { type: String, required: true, unique: true },
  guildId: { type: String, required: true, index: true },
  serverIp: { type: String, required: true },
  serverPort: { type: Number, required: true, default: 25565 },
  serverName: { type: String, required: true },
  lastPingTime: { type: Date, default: null },
  lastPingData: { type: Schema.Types.Mixed, default: null },
  persistData: { type: MessagePersistSchema, default: undefined },
});

McServerStatusSchema.index({ guildId: 1, serverName: 1 }, { unique: true });

export type IMcServerStatus = InferSchemaType<typeof McServerStatusSchema>;
export type IMessagePersist = InferSchemaType<typeof MessagePersistSchema>;

const McServerStatus = (mongoose.models.McServerStatus || model("McServerStatus", McServerStatusSchema)) as Model<IMcServerStatus>;

export default McServerStatus;
