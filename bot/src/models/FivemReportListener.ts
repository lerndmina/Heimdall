import { Schema, model } from "mongoose";

export default model(
  "FivemReportListener",
  new Schema({
    listenChannelId: {
      type: String,
      required: true,
      unique: true,
    },
    reportChannelId: {
      type: String,
      required: true,
    },
    prefix: {
      type: String,
      required: true,
    },
    roleId: {
      type: String,
      required: false,
    },
  })
);
