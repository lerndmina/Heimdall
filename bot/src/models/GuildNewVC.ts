import { InferSchemaType, Schema, model } from "mongoose";
const GuildNewVCSchema = new Schema({
  guildID: {
    type: String,
    required: true,
  },
  guildChannelIDs: {
    type: [
      {
        channelID: String,
        categoryID: String,
        useSequentialNames: Boolean,
        channelName: String,
      },
    ],
    default: {},
  },
});

export const GuildNewVC = model("GuildNewVC", GuildNewVCSchema);
export type GuildNewVCType = InferSchemaType<typeof GuildNewVCSchema>;
