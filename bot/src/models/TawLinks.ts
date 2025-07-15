import { Schema, model } from "mongoose";

export default model(
  "TawLinks",
  new Schema({
    discordUserId: {
      type: String,
      required: true,
    },
    tawUserCallsign: {
      type: String,
      required: true,
    },
    linkCode: {
      type: String,
      required: false,
    },
    codeExpiresAt: {
      type: Date,
      required: false,
    },
    fullyLinked: {
      type: Boolean,
      required: false,
    },
  })
);
