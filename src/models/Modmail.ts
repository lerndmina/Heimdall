import { InferSchemaType, Schema, model } from "mongoose";
import FetchEnvs from "../utils/FetchEnvs";
const env = FetchEnvs();

const modmailSchema = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  forumThreadId: {
    type: String,
    required: true,
  },
  forumChannelId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  userAvatar: {
    type: String,
    required: false,
  },
  userDisplayName: {
    type: String,
    required: false,
  },
});

export default model(env.MODMAIL_TABLE, modmailSchema);

export type ModmailType = InferSchemaType<typeof modmailSchema>;
