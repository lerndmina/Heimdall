/**
 * TempVC Model - Configuration for temporary voice channel creators
 *
 * Stores which voice channels act as "creators" that spawn temporary VCs
 * when users join them. Each guild can have multiple creator channels.
 */

import mongoose, { Schema, model, type Model } from "mongoose";
import type { InferSchemaType } from "mongoose";

const TempVCSchema = new Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  channels: [
    {
      channelId: {
        type: String,
        required: true,
      },
      categoryId: {
        type: String,
        required: true,
      },
      useSequentialNames: {
        type: Boolean,
        default: false,
      },
      channelName: {
        type: String,
        default: "Temp VC",
      },
      /**
       * How permissions are applied to spawned temp VCs:
       * - "inherit_opener": copy the opener channel's permission overwrites
       * - "inherit_category": copy the target category's permission overwrites
       * - "custom": use the roleOverrides array below
       * - "none": only give the creator ManageChannels/ManageRoles (default)
       */
      permissionMode: {
        type: String,
        enum: ["none", "inherit_opener", "inherit_category", "custom"],
        default: "none",
      },
      /**
       * Custom role permission overrides applied when permissionMode is "custom".
       * Each entry specifies a role and whether to allow/deny View and Connect.
       */
      roleOverrides: [
        {
          roleId: { type: String, required: true },
          /** "allow" | "deny" | "neutral" */
          view: { type: String, enum: ["allow", "deny", "neutral"], default: "neutral" },
          /** "allow" | "deny" | "neutral" */
          connect: { type: String, enum: ["allow", "deny", "neutral"], default: "neutral" },
        },
      ],
      /**
       * Whether to DM users a channel link when they are invited via the control panel.
       * Useful for staff channels; disable for public channels to prevent spam.
       */
      sendInviteDM: {
        type: Boolean,
        default: false,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

TempVCSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

type ITempVC = InferSchemaType<typeof TempVCSchema>;

const TempVC = (mongoose.models.TempVC || model<ITempVC>("TempVC", TempVCSchema)) as Model<ITempVC>;

export default TempVC;
export type { ITempVC };
