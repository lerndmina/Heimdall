import { Schema, model } from "mongoose";

export default model(
  "TagSchema",
  new Schema({
    key: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    tag: {
      type: String,
      required: true,
    },
  })
);
