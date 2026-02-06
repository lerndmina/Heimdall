/**
 * HeimdallCoin Economy Model
 *
 * Per-user virtual currency with daily claim cooldown.
 * Starting balance: 1000 coins.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const HeimdallCoinSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 1000,
    },
    lastDaily: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Unique user index
HeimdallCoinSchema.index({ userId: 1 }, { unique: true });

type IHeimdallCoin = InferSchemaType<typeof HeimdallCoinSchema>;

const HeimdallCoin = (mongoose.models.HeimdallCoin || model<IHeimdallCoin>("HeimdallCoin", HeimdallCoinSchema)) as Model<IHeimdallCoin>;

export default HeimdallCoin;
export type { IHeimdallCoin };

// ── Helper class ──────────────────────────────────────

export class HeimdallCoinHelper {
  /** Get or create a user's coin record */
  static async getOrCreate(userId: string): Promise<IHeimdallCoin & { _id: any }> {
    let record = await HeimdallCoin.findOne({ userId });
    if (!record) {
      record = await HeimdallCoin.create({ userId });
    }
    return record;
  }

  /** Add coins to a user's balance */
  static async addCoins(userId: string, amount: number): Promise<number> {
    const record = await this.getOrCreate(userId);
    record.balance += amount;
    await (record as any).save();
    return record.balance;
  }

  /** Remove coins from a user's balance. Throws if insufficient. */
  static async removeCoins(userId: string, amount: number): Promise<number> {
    const record = await this.getOrCreate(userId);
    if (record.balance < amount) {
      throw new Error("Insufficient coins");
    }
    record.balance -= amount;
    await (record as any).save();
    return record.balance;
  }
}
