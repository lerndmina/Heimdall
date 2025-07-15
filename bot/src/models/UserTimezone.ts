import { Schema, model } from "mongoose";

export default model(
  "UserTimezone",
  new Schema({
    userId: {
      type: String,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
    }
  })
);
