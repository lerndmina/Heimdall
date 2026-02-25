import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const DashboardUserSettingsSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    applicationsAccordionMultiOpen: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

DashboardUserSettingsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

type IDashboardUserSettings = InferSchemaType<typeof DashboardUserSettingsSchema>;

const DashboardUserSettings = (mongoose.models.DashboardUserSettings || model<IDashboardUserSettings>("DashboardUserSettings", DashboardUserSettingsSchema)) as Model<IDashboardUserSettings>;

export default DashboardUserSettings;
export type { IDashboardUserSettings };
