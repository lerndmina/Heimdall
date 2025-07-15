import { InferSchemaType, Schema, model } from "mongoose";

const LogSchema = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  enabledLogs: {
    type: [String],
    required: true,
  },
});

export default model("LogSchema", LogSchema);

export type LogSchemaType = InferSchemaType<typeof LogSchema>;
