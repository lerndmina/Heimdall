import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const ApplicationFieldSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 256 },
    value: { type: String, required: true, trim: true, maxlength: 1024 },
    inline: { type: Boolean, default: false },
  },
  { _id: false },
);

const ApplicationEmbedSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 256 },
    description: { type: String, trim: true, maxlength: 4096 },
    color: { type: String, trim: true, maxlength: 16 },
    image: { type: String, trim: true, maxlength: 2048 },
    thumbnail: { type: String, trim: true, maxlength: 2048 },
    footer: { type: String, trim: true, maxlength: 2048 },
    fields: { type: [ApplicationFieldSchema], default: undefined },
  },
  { _id: false },
);

const ApplicationQuestionOptionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 100 },
    value: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 100 },
    emoji: { type: String, trim: true, maxlength: 64 },
  },
  { _id: false },
);

const ApplicationQuestionSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ["short", "long", "select_single", "select_multi", "button", "number"],
      default: "short",
    },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500 },
    placeholder: { type: String, trim: true, maxlength: 150 },
    required: { type: Boolean, default: true },
    minLength: { type: Number, min: 0, max: 4000 },
    maxLength: { type: Number, min: 1, max: 4000 },
    minValue: { type: Number },
    maxValue: { type: Number },
    options: { type: [ApplicationQuestionOptionSchema], default: undefined },
  },
  { _id: false },
);

const ApplicationPanelPostSchema = new Schema(
  {
    panelId: { type: String, required: true, trim: true },
    channelId: { type: String, required: true, trim: true },
    messageId: { type: String, required: true, trim: true },
    postedAt: { type: Date, required: true, default: Date.now },
    postedBy: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ApplicationFormSchema = new Schema(
  {
    formId: { type: String, required: true, unique: true, index: true },
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 64 },
    enabled: { type: Boolean, default: false },

    embed: { type: ApplicationEmbedSchema, default: {} },
    questions: { type: [ApplicationQuestionSchema], default: [] },

    submissionChannelId: { type: String, trim: true },
    submissionChannelType: { type: String, enum: ["text", "forum"], default: "text" },
    reviewRoleIds: { type: [String], default: [] },
    requiredRoleIds: { type: [String], default: [] },
    restrictedRoleIds: { type: [String], default: [] },

    acceptRoleIds: { type: [String], default: [] },
    denyRoleIds: { type: [String], default: [] },
    acceptRemoveRoleIds: { type: [String], default: [] },
    denyRemoveRoleIds: { type: [String], default: [] },
    pingRoleIds: { type: [String], default: [] },

    cooldownSeconds: { type: Number, min: 0, max: 60 * 60 * 24 * 365, default: 0 },
    completionMessage: { type: String, trim: true, maxlength: 2000 },
    acceptMessage: { type: String, trim: true, maxlength: 2000 },
    denyMessage: { type: String, trim: true, maxlength: 2000 },
    modmailCategoryId: { type: String, trim: true },

    panels: { type: [ApplicationPanelPostSchema], default: [] },

    createdBy: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

ApplicationFormSchema.index({ guildId: 1, name: 1 }, { unique: true });

type IApplicationForm = InferSchemaType<typeof ApplicationFormSchema>;

const ApplicationForm = (mongoose.models.ApplicationForm || model<IApplicationForm>("ApplicationForm", ApplicationFormSchema)) as Model<IApplicationForm>;

export default ApplicationForm;
export type { IApplicationForm };
