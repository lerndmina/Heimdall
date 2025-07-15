import { Collection, InferSchemaType, Schema, model } from "mongoose";

const TicTacToeSchema = new Schema({
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
  size: {
    type: Number,
    required: true,
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

export default model("TicTacToeSchema", TicTacToeSchema);

export type TicTacToeSchemaType = InferSchemaType<typeof TicTacToeSchema>;
