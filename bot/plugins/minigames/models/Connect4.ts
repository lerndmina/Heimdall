/**
 * Connect4 Game Model
 *
 * Stores state for active Connect4 games with 6×7 board.
 * 24-hour TTL auto-deletes stale games.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const Connect4Schema = new Schema(
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
      type: [[String]],
      required: true,
      default: (): (string | null)[][] =>
        Array(6)
          .fill(null)
          .map(() => Array(7).fill(null) as (string | null)[]),
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
Connect4Schema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

type IConnect4 = InferSchemaType<typeof Connect4Schema>;

const Connect4 = (mongoose.models.Connect4 || model<IConnect4>("Connect4", Connect4Schema)) as Model<IConnect4>;

export default Connect4;
export type { IConnect4 };
