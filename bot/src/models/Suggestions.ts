import { InferSchemaType, Schema, model } from "mongoose";
import { randomUUID } from "crypto";

export enum VoteType {
  Upvote = "upvote",
  Downvote = "downvote",
}

export enum SuggestionStatus {
  Pending = "pending",
  Approved = "approved",
  Denied = "denied",
}

const VotesSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  vote: {
    type: String,
    enum: [VoteType.Upvote, VoteType.Downvote],
    required: true,
  },
});

const Suggestion = new Schema({
  id: {
    type: String,
    unique: true, // Ensure uniqueness of IDs
    index: true, // Add index for better query performance
    default: () => randomUUID(),
  },
  guildId: {
    type: String,
    required: true,
  },
  messageLink: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  suggestion: {
    type: String,
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  votes: {
    type: [VotesSchema],
    default: [],
    required: false,
  },
  status: {
    type: String,
    enum: [SuggestionStatus.Pending, SuggestionStatus.Approved, SuggestionStatus.Denied],
    default: SuggestionStatus.Pending,
  },
  managedBy: {
    type: String,
    required: false,
  },
});

// Add pre-save hook to handle potential ID collisions
Suggestion.pre("save", async function (next) {
  const doc = this;

  // Only generate ID if it's a new document and no ID is set
  if (doc.isNew && !doc.id) {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5; // Prevent infinite loop

    // Keep generating IDs until we find a unique one or hit max attempts
    while (!isUnique && attempts < maxAttempts) {
      const candidateId = randomUUID();
      doc.id = candidateId;

      // Check if this ID already exists
      const existing = await SuggestionModel.findOne({ id: candidateId });
      isUnique = !existing;
      attempts++;

      if (!isUnique) {
        console.log(`ID collision detected (attempt ${attempts}), generating new ID`);
      }
    }

    if (!isUnique) {
      return next(new Error(`Failed to generate unique ID after ${maxAttempts} attempts`));
    }
  }

  next();
});

// Create the model
const SuggestionModel = model("Suggestion", Suggestion);

export type SuggestionsType = InferSchemaType<typeof Suggestion>;
export type VotesModelType = InferSchemaType<typeof VotesSchema>;

export default SuggestionModel;
