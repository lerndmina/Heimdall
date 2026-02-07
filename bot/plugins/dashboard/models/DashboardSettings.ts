/**
 * DashboardSettings Model — Per-guild dashboard display settings.
 *
 * Controls how the dashboard sidebar renders for users with limited permissions.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const DashboardSettingsSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * When `true`, sidebar items the user cannot access are hidden entirely.
     * When `false` (default), inaccessible items are shown grayed-out with a lock icon.
     */
    hideDeniedFeatures: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

type IDashboardSettings = InferSchemaType<typeof DashboardSettingsSchema>;

const DashboardSettings = (mongoose.models.DashboardSettings ||
  model<IDashboardSettings>("DashboardSettings", DashboardSettingsSchema)) as Model<IDashboardSettings>;

export default DashboardSettings;
export type { IDashboardSettings };
