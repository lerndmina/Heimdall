import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const ApplicationAnswerSchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true },
    questionLabel: { type: String, required: true, trim: true, maxlength: 300 },
    questionType: {
      type: String,
      required: true,
      enum: ["short", "long", "select_single", "select_multi", "button", "number"],
    },
    value: { type: String },
    values: { type: [String], default: undefined },
  },
  { _id: false },
);

const ApplicationSubmissionSchema = new Schema(
  {
    applicationId: { type: String, required: true, unique: true, index: true },
    applicationNumber: { type: Number, required: true, min: 1 },
    guildId: { type: String, required: true, index: true },
    formId: { type: String, required: true, index: true },
    formName: { type: String, required: true, trim: true, maxlength: 64 },

    userId: { type: String, required: true, index: true },
    userDisplayName: { type: String, required: true, trim: true, maxlength: 120 },
    userAvatarUrl: { type: String, trim: true, maxlength: 2048 },

    status: { type: String, required: true, enum: ["pending", "approved", "denied"], default: "pending", index: true },
    responses: { type: [ApplicationAnswerSchema], default: [] },

    submissionChannelId: { type: String, trim: true },
    submissionMessageId: { type: String, trim: true },
    forumThreadId: { type: String, trim: true },

    reviewedBy: { type: String, trim: true },
    reviewedAt: { type: Date },
    reviewReason: { type: String, trim: true, maxlength: 2000 },
    linkedModmailId: { type: String, trim: true },
  },
  { timestamps: true },
);

ApplicationSubmissionSchema.index({ guildId: 1, applicationNumber: -1 });
ApplicationSubmissionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });

type IApplicationSubmission = InferSchemaType<typeof ApplicationSubmissionSchema>;

const ApplicationSubmission = (mongoose.models.ApplicationSubmission || model<IApplicationSubmission>("ApplicationSubmission", ApplicationSubmissionSchema)) as Model<IApplicationSubmission>;

export default ApplicationSubmission;
export type { IApplicationSubmission };
