import { Schema, model } from "mongoose";

export default model(
  "ActiveTempChanels",
  new Schema({
    guildID: {
      type: String,
      required: true,
    },
    channelIDs: {
      type: [String],
      default: [],
    },
  })
);
