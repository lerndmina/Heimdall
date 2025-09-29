import { Schema, model, Document } from "mongoose";

export interface RoleSyncLogType extends Document {
  guildId: string;
  playerId: string;
  minecraftUsername: string;
  discordId?: string;

  // Sync operation details
  syncTrigger: "login" | "discord_role_change" | "manual";
  discordRolesBefore: string[];
  discordRolesAfter: string[];
  minecraftGroupsBefore: string[];
  minecraftGroupsAfter: string[];

  // Changes applied
  groupsAdded: string[];
  groupsRemoved: string[];

  // Operation result
  success: boolean;
  error?: string;

  // Timestamps
  timestamp: Date;
  createdAt: Date;
}

const RoleSyncLogSchema = new Schema<RoleSyncLogType>(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },
    playerId: {
      type: String,
      required: true,
      index: true,
    },
    minecraftUsername: {
      type: String,
      required: true,
    },
    discordId: {
      type: String,
    },

    // Sync operation details
    syncTrigger: {
      type: String,
      enum: ["login", "discord_role_change", "manual"],
      required: true,
    },
    discordRolesBefore: [{ type: String }],
    discordRolesAfter: [{ type: String }],
    minecraftGroupsBefore: [{ type: String }],
    minecraftGroupsAfter: [{ type: String }],

    // Changes applied
    groupsAdded: [{ type: String }],
    groupsRemoved: [{ type: String }],

    // Operation result
    success: {
      type: Boolean,
      required: true,
    },
    error: {
      type: String,
    },

    // Timestamps
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
RoleSyncLogSchema.index({ guildId: 1, timestamp: -1 });
RoleSyncLogSchema.index({ guildId: 1, playerId: 1, timestamp: -1 });
RoleSyncLogSchema.index({ guildId: 1, minecraftUsername: 1, timestamp: -1 });

const RoleSyncLog = model<RoleSyncLogType>("RoleSyncLog", RoleSyncLogSchema);

export default RoleSyncLog;
