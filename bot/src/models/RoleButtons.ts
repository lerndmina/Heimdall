import { Schema, model } from "mongoose";

export default model(
  "RoleButtons",
  new Schema({
    buttonId: {
      type: String,
      required: true,
      unique: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    roleId: {
      type: String,
      required: true,
    },
  })
);
