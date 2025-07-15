import { Schema, model } from "mongoose";

export default model(
  "DontAtMeRole",
  new Schema({
    roleId: {
      type: String,
      required: true,
      unique: true,
    },
    guildId: {
      type: String,
      required: true,
    },
  })
);
