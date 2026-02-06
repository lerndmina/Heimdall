import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";
import { customAlphabet } from "nanoid";

/** Suggestion status enum */
export enum SuggestionStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

/** Vote type enum */
export enum VoteType {
  Upvote = "upvote",
  Downvote = "downvote",
}

const VoteSchema = new Schema(
  {
    userId: { type: String, required: true },
    vote: { type: String, enum: Object.values(VoteType), required: true },
    votedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SuggestionSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    mode: { type: String, enum: ["embed", "forum"], required: true },
    suggestion: { type: String, required: true, minlength: 20, maxlength: 1000 },
    reason: { type: String, required: true, minlength: 20, maxlength: 500 },
    title: { type: String, required: true },
    categoryId: { type: String },
    status: {
      type: String,
      enum: Object.values(SuggestionStatus),
      default: SuggestionStatus.Pending,
      index: true,
    },
    messageLink: { type: String, required: true },
    threadId: { type: String },
    firstMessageId: { type: String },
    votes: { type: [VoteSchema], default: [] },
    managedBy: { type: String },
  },
  { timestamps: true },
);

SuggestionSchema.index({ mode: 1, guildId: 1 });
SuggestionSchema.index({ status: 1, guildId: 1 });
SuggestionSchema.index({ categoryId: 1, guildId: 1 });
SuggestionSchema.index({ threadId: 1 }, { sparse: true });

export type ISuggestion = InferSchemaType<typeof SuggestionSchema>;

const Suggestion = (mongoose.models.Suggestion || model<ISuggestion>("Suggestion", SuggestionSchema)) as Model<ISuggestion>;

export default Suggestion;

/** Generate a unique 8-character suggestion ID */
export async function generateUniqueSuggestionId(): Promise<string> {
  const nanoidGen = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8);
  let attempts = 0;
  while (attempts < 10) {
    const id = nanoidGen();
    const existing = await Suggestion.findOne({ id });
    if (!existing) return id;
    attempts++;
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/** Helper methods for Suggestions */
export class SuggestionHelper {
  static getVoteCounts(suggestion: ISuggestion): { upvotes: number; downvotes: number } {
    const upvotes = suggestion.votes?.filter((v) => v.vote === VoteType.Upvote).length || 0;
    const downvotes = suggestion.votes?.filter((v) => v.vote === VoteType.Downvote).length || 0;
    return { upvotes, downvotes };
  }

  static getUserVote(suggestion: ISuggestion, userId: string): VoteType | null {
    const vote = suggestion.votes?.find((v) => v.userId === userId);
    return vote ? (vote.vote as VoteType) : null;
  }

  static hasUserVoted(suggestion: ISuggestion, userId: string): boolean {
    return suggestion.votes?.some((v) => v.userId === userId) || false;
  }

  static getNetVotes(suggestion: ISuggestion): number {
    const { upvotes, downvotes } = this.getVoteCounts(suggestion);
    return upvotes - downvotes;
  }
}
