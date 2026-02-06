import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const SuggestionOpenerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    title: { type: String, default: "Submit a Suggestion" },
    description: { type: String, default: "Select a category below to submit your suggestion. Your feedback helps us improve!" },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

SuggestionOpenerSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export type ISuggestionOpener = InferSchemaType<typeof SuggestionOpenerSchema>;

const SuggestionOpener = (mongoose.models.SuggestionOpener || model<ISuggestionOpener>("SuggestionOpener", SuggestionOpenerSchema)) as Model<ISuggestionOpener>;

export default SuggestionOpener;
