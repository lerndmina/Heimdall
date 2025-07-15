import { InferSchemaType, Schema, model } from "mongoose";

const OptionSchema = new Schema({
  votes: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
});

const VoterDetailsSchema = new Schema({
  userId: {
    type: String,
    required: true,
  },
  optionIndex: {
    type: Number,
    required: true,
  },
  lastVoteTime: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const PollsSchema = new Schema({
  pollId: {
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
  creatorId: {
    type: String,
    required: true,
  },
  endsAt: {
    type: Date,
    required: true,
  },
  options: [OptionSchema],
  embedDescriptionArray: {
    type: [String],
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  hasFinished: {
    type: Boolean,
    required: false,
  },
  voters: {
    type: [String],
    required: false,
  },
  voterDetails: [VoterDetailsSchema],
  mentionRole: {
    type: String,
    required: false,
  },
});

export default model("Polls", PollsSchema);

export type PollsType = InferSchemaType<typeof PollsSchema>;
