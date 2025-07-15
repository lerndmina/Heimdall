import { InferSchemaType, Schema, model } from "mongoose";

const MessagePersistSchema = new Schema({
  messageId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  updateInterval: {
    type: Number,
    required: true,
    default: 30000,
  },
  lastUpdate: {
    type: Date,
    required: true,
    default: Date.now(),
  },
});

const McServerStatusSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  guildId: {
    type: String,
    required: true,
  },
  serverIp: {
    type: String,
    required: true,
  },
  serverPort: {
    type: Number,
    required: true,
    default: 25565,
  },
  serverName: {
    type: String,
    required: true,
    unique: true,
  },
  lastPingTime: {
    type: Date,
    required: false,
    default: null,
  },
  lastPingData: {
    type: Object,
    required: false,
    default: null,
  },
  persistData: {
    type: MessagePersistSchema,
    required: false,
  },
});

// Create the model
const McServerStatusModel = model("McServerStatusSchema", McServerStatusSchema);

export type McServerStatusType = InferSchemaType<typeof McServerStatusSchema>;
export type MessagePersistType = InferSchemaType<typeof MessagePersistSchema>;

export default McServerStatusModel;
