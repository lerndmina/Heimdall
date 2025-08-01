import { InferSchemaType, Schema, model } from "mongoose";

const Connect4Schema = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  initiatorId: {
    type: String,
    required: true,
  },
  opponentId: {
    type: String,
    required: true,
  },
  width: {
    type: Number,
    required: true,
    default: 7,
  },
  height: {
    type: Number,
    required: true,
    default: 6,
  },
  gameState: {
    type: Object,
    required: true,
  },
  turn: {
    type: String, // initiatorId or opponentId
    required: true,
  },
  gameOver: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model("Connect4Schema", Connect4Schema);

export type Connect4SchemaType = InferSchemaType<typeof Connect4Schema>;
