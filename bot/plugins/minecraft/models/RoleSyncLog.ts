/**
 * RoleSyncLog — Audit log for Discord ↔ Minecraft role sync operations
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const RoleSyncLogSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    playerId: { type: String, required: true, index: true },
    minecraftUsername: { type: String, required: true },
    discordId: { type: String },

    // Sync details
    syncTrigger: { type: String, enum: ["login", "discord_role_change", "manual"], required: true },
    discordRolesBefore: [{ type: String }],
    discordRolesAfter: [{ type: String }],
    minecraftGroupsBefore: [{ type: String }],
    minecraftGroupsAfter: [{ type: String }],

    // Changes
    groupsAdded: [{ type: String }],
    groupsRemoved: [{ type: String }],

    // Result
    success: { type: Boolean, required: true },
    error: { type: String },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

RoleSyncLogSchema.index({ guildId: 1, timestamp: -1 });
RoleSyncLogSchema.index({ guildId: 1, playerId: 1, timestamp: -1 });

export type IRoleSyncLog = InferSchemaType<typeof RoleSyncLogSchema>;

const RoleSyncLog = (mongoose.models.RoleSyncLog || model("RoleSyncLog", RoleSyncLogSchema)) as Model<IRoleSyncLog>;

export default RoleSyncLog;
