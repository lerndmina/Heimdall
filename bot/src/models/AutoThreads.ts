import { InferSchemaType, Schema, model } from "mongoose";

const AutoThread = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  regex: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 100,
  },
  onlyBots: {
    type: Boolean,
    default: false,
  },
  onlyWebhooks: {
    type: Boolean,
    default: false,
  },
});

export default model("AutoThread", AutoThread);

export type AutoThreadType = InferSchemaType<typeof AutoThread>;
