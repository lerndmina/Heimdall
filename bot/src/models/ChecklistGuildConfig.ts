import { InferSchemaType, Schema, model } from "mongoose";

const CheclistGuildConfig = new Schema({
  guildId: {
    type: String,
    required: true,
  },
  enabled: {
    type: Boolean,
    default: false,
  },
  staffRoleIds: {
    type: [String],
    default: [],
  },
});

export default model("CheclistGuildConfig", CheclistGuildConfig);

export type ChecklistGuildConfigType = InferSchemaType<typeof CheclistGuildConfig>;
