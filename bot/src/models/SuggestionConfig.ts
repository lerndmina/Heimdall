import { InferSchemaType, Schema, model } from "mongoose";

const SuggestionConfig = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
});

// Create the model
const SuggestionConfigModel = model("SuggestionConfig", SuggestionConfig);

export type SuggestionConfigType = InferSchemaType<typeof SuggestionConfig>;

export default SuggestionConfigModel;
