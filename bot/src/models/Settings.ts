import { InferSchemaType, Schema, model } from "mongoose";

const SettingSchema = new Schema({
  botId: {
    type: String,
    required: true,
  },
  activityText: {
    type: String,
    required: false,
  },
  activityType: {
    type: Number,
    required: false,
  },
});

export default model("Settings", SettingSchema);

export type SettingsType = InferSchemaType<typeof SettingSchema>;
