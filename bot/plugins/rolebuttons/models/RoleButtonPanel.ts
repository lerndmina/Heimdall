import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const RoleButtonFieldSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 256 },
    value: { type: String, required: true, trim: true, maxlength: 1024 },
    inline: { type: Boolean, default: false },
  },
  { _id: false },
);

const RoleButtonEmbedSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 256 },
    description: { type: String, trim: true, maxlength: 4096 },
    color: { type: String, trim: true, maxlength: 16 },
    image: { type: String, trim: true, maxlength: 2048 },
    thumbnail: { type: String, trim: true, maxlength: 2048 },
    footer: { type: String, trim: true, maxlength: 2048 },
    fields: { type: [RoleButtonFieldSchema], default: undefined },
  },
  { _id: false },
);

const RoleButtonDefinitionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    emoji: { type: String, trim: true, maxlength: 64 },
    style: { type: Number, required: true, enum: [1, 2, 3, 4], default: 2 },
    roleId: { type: String, required: true, trim: true },
    mode: { type: String, required: true, enum: ["toggle", "add", "remove"], default: "toggle" },
    row: { type: Number, required: true, min: 0, max: 4, default: 0 },
  },
  { _id: false },
);

const RoleButtonPostSchema = new Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
    postedAt: { type: Date, required: true, default: Date.now },
    postedBy: { type: String, required: true },
  },
  { _id: false },
);

const RoleButtonPanelSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 64 },
    embed: { type: RoleButtonEmbedSchema, default: {} },
    buttons: { type: [RoleButtonDefinitionSchema], default: [] },
    exclusive: { type: Boolean, default: false },
    posts: { type: [RoleButtonPostSchema], default: [] },
    createdBy: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

RoleButtonPanelSchema.index({ guildId: 1, name: 1 }, { unique: true });

type IRoleButtonPanel = InferSchemaType<typeof RoleButtonPanelSchema>;

const RoleButtonPanel = (mongoose.models.RoleButtonPanel || model<IRoleButtonPanel>("RoleButtonPanel", RoleButtonPanelSchema)) as Model<IRoleButtonPanel>;

export default RoleButtonPanel;
export type { IRoleButtonPanel };
