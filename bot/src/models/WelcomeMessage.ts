import { InferSchemaType, Schema, model } from "mongoose";

const WelcomeMessageSchema = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
});

export default model("WelcomeMessageSchema", WelcomeMessageSchema);

export type WelcomeMessageSchemaType = InferSchemaType<typeof WelcomeMessageSchema>;
