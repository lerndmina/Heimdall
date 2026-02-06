/**
 * PersistentComponent Model - Maps component customId to handler ID
 */

import mongoose, { Schema, model, type Model, type InferSchemaType } from "mongoose";

const PersistentComponentSchema = new Schema(
  {
    customId: { type: String, required: true, unique: true },
    handlerId: { type: String, required: true },
    componentType: { type: String, enum: ["button", "selectMenu"], required: true },
    metadata: { type: Schema.Types.Mixed, required: false },
    messageId: { type: String, required: false, index: true },
    channelId: { type: String, required: false, index: true },
    guildId: { type: String, required: false, index: true },
  },
  { timestamps: true },
);

PersistentComponentSchema.index({ handlerId: 1 });

export type IPersistentComponent = InferSchemaType<typeof PersistentComponentSchema>;

const PersistentComponentModel = (mongoose.models.PersistentComponent || model("PersistentComponent", PersistentComponentSchema)) as Model<IPersistentComponent>;

export default PersistentComponentModel;
