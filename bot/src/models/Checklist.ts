import { InferSchemaType, Schema, model } from "mongoose";

const ChecklistCompletedData = new Schema({
  userId: {
    type: String,
    required: true,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  completionComment: {
    type: String,
    default: "",
  },
});

const ChecklistItem = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  completedSteps: {
    type: Number,
    default: 0,
  },
  totalSteps: {
    type: Number,
    required: true,
  },
  upDatedAt: {
    type: Date,
    default: Date.now,
  },
  completedData: {
    type: [ChecklistCompletedData],
    default: [],
  },
});

export const ChecklistSchema = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  items: {
    type: [ChecklistItem],
    default: [],
  },
});

export default model("Checklist", ChecklistSchema);

export type ChecklistType = InferSchemaType<typeof ChecklistSchema>;
