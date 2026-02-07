/**
 * DashboardPermission Model — Per-role permission overrides for the web dashboard.
 *
 * Each document represents one Discord role's overrides in a guild.
 * Override keys are category-level ("minecraft") or action-level ("minecraft.manage_config").
 * Values are "allow" or "deny". Absence = inherit.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const DashboardPermissionSchema = new Schema(
  {
    guildId: {
      type: String,
      required: true,
    },
    discordRoleId: {
      type: String,
      required: true,
    },
    roleName: {
      type: String,
      required: true,
    },
    /** Keys: category ("minecraft") or action ("minecraft.manage_config"), values: "allow" | "deny" */
    overrides: {
      type: Map,
      of: {
        type: String,
        enum: ["allow", "deny"],
      },
      default: new Map(),
    },
  },
  { timestamps: true },
);

// Compound unique index: one entry per role per guild
DashboardPermissionSchema.index({ guildId: 1, discordRoleId: 1 }, { unique: true });

type IDashboardPermission = InferSchemaType<typeof DashboardPermissionSchema>;

const DashboardPermission = (mongoose.models.DashboardPermission ||
  model<IDashboardPermission>("DashboardPermission", DashboardPermissionSchema)) as Model<IDashboardPermission>;

export default DashboardPermission;
export type { IDashboardPermission };
