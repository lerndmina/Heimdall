import { InferSchemaType, Schema, model } from "mongoose";

const ChecklistConfig = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  forumChannelId: {
    type: String,
    required: true,
  },
  items: [
    {
      name: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
      totalSteps: {
        type: Number,
        default: 1,
      },
    },
  ],
  footerDescription: {
    type: String,
    default: "",
  },
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model("ChecklistConfig", ChecklistConfig);

export type ChecklistConfigType = InferSchemaType<typeof ChecklistConfig>;
