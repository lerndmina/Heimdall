import { InferSchemaType, Schema, model } from "mongoose";
import { ChecklistSchema } from "./Checklist";

const ChecklistInstance = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  messageUrl: {
    type: String,
    required: true,
  },
  checklist: {
    type: ChecklistSchema,
    required: true,
  },
});

export default model("ChecklistInstance", ChecklistInstance);

export type ChecklistInstanceType = InferSchemaType<typeof ChecklistInstance>;
