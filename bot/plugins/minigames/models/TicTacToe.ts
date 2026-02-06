/**
 * TicTacToe Game Model
 *
 * Stores state for active TicTacToe games with a flat 9-element board.
 * 24-hour TTL auto-deletes stale games.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const TicTacToeSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    channelId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    player1: {
      type: String,
      required: true,
    },
    player2: {
      type: String,
      required: true,
    },
    currentTurn: {
      type: String,
      required: true,
    },
    board: {
      type: [String],
      required: true,
      default: (): (string | null)[] => Array(9).fill(null) as (string | null)[],
    },
    winner: {
      type: String,
      default: null,
    },
    isDraw: {
      type: Boolean,
      default: false,
    },
    gameOver: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// TTL index — auto-delete games after 24 hours
TicTacToeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

type ITicTacToe = InferSchemaType<typeof TicTacToeSchema>;

const TicTacToe = (mongoose.models.TicTacToe || model<ITicTacToe>("TicTacToe", TicTacToeSchema)) as Model<ITicTacToe>;

export default TicTacToe;
export type { ITicTacToe };
