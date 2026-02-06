/**
 * MinecraftPlayer — Per-guild Minecraft player records
 *
 * Tracks linking flow, whitelist status, auth codes, role sync state,
 * and audit trail for each player–Discord account association.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model, type Document } from "mongoose";

const MinecraftPlayerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },

    // MC identity
    minecraftUuid: { type: String, sparse: true },
    minecraftUsername: { type: String, required: true },

    // Discord identity (null for imported players)
    discordId: { type: String, sparse: true },
    discordUsername: { type: String, sparse: true },
    discordDisplayName: { type: String, sparse: true },

    // Status timestamps
    linkedAt: { type: Date },
    whitelistedAt: { type: Date },
    lastConnectionAttempt: { type: Date },

    // Auth code flow
    authCode: { type: String, sparse: true },
    expiresAt: { type: Date },
    codeShownAt: { type: Date },
    confirmedAt: { type: Date },

    // Process tracking
    isExistingPlayerLink: { type: Boolean },
    rejectionReason: { type: String },

    // Audit trail
    approvedBy: { type: String },
    revokedBy: { type: String },
    revokedAt: { type: Date },
    revocationReason: { type: String },

    // Metadata
    source: { type: String, enum: ["imported", "linked", "manual", "existing"], default: "linked" },
    notes: { type: String },

    // Role sync tracking
    lastDiscordRoles: [{ type: String }],
    lastMinecraftGroups: [{ type: String }],
    lastRoleSyncAt: { type: Date },
    roleSyncEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Compound indexes
MinecraftPlayerSchema.index({ guildId: 1, minecraftUuid: 1 }, { unique: true, partialFilterExpression: { minecraftUuid: { $exists: true, $type: "string" } } });
MinecraftPlayerSchema.index({ guildId: 1, minecraftUsername: 1 }, { unique: true });
MinecraftPlayerSchema.index({ guildId: 1, discordId: 1 }, { sparse: true });
MinecraftPlayerSchema.index({ guildId: 1, whitelistedAt: 1 });
MinecraftPlayerSchema.index({ authCode: 1 }, { sparse: true, unique: true });
MinecraftPlayerSchema.index({ guildId: 1, authCode: 1, expiresAt: 1 });
MinecraftPlayerSchema.index({ guildId: 1, linkedAt: 1, whitelistedAt: 1 });

// ── Virtuals ───────────────────────────────────────────────────

MinecraftPlayerSchema.virtual("isWhitelisted").get(function () {
  return !!this.whitelistedAt && !this.revokedAt;
});

MinecraftPlayerSchema.virtual("whitelistStatus").get(function () {
  if (this.revokedAt) return "revoked";
  if (this.whitelistedAt) return "whitelisted";
  return "pending";
});

MinecraftPlayerSchema.virtual("isLinked").get(function () {
  return !!this.discordId;
});

MinecraftPlayerSchema.virtual("hasActiveAuth").get(function () {
  return !!this.authCode && !!this.expiresAt && this.expiresAt > new Date();
});

MinecraftPlayerSchema.virtual("playerStatus").get(function () {
  if (this.discordId) return "linked";
  if (this.authCode && this.expiresAt && this.expiresAt > new Date()) return "linking";
  return "unlinked";
});

MinecraftPlayerSchema.virtual("authStatus").get(function (): "none" | "pending" | "expired" | "confirmed" | "revoked" {
  if (this.revokedAt) return "revoked";
  if (this.confirmedAt) return "confirmed";
  if (this.authCode && this.expiresAt && this.expiresAt > new Date()) return "pending";
  if (this.authCode && this.expiresAt && this.expiresAt <= new Date()) return "expired";
  return "none";
});

// ── Instance methods ───────────────────────────────────────────

MinecraftPlayerSchema.methods.startAuthProcess = function (discordId?: string): void {
  this.authCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  this.codeShownAt = new Date();
  if (discordId) this.discordId = discordId;
};

MinecraftPlayerSchema.methods.confirmAuth = function (discordId: string, approvedBy?: string): void {
  this.confirmedAt = new Date();
  this.discordId = discordId;
  this.whitelistedAt = new Date();
  if (approvedBy) this.approvedBy = approvedBy;
};

MinecraftPlayerSchema.methods.linkAccount = function (discordId: string, discordUsername?: string, displayName?: string): void {
  this.discordId = discordId;
  this.linkedAt = new Date();
  if (discordUsername) this.discordUsername = discordUsername;
  if (displayName) this.discordDisplayName = displayName;
};

MinecraftPlayerSchema.methods.unlinkAccount = function (): void {
  this.discordId = undefined;
  this.discordUsername = undefined;
  this.discordDisplayName = undefined;
  this.linkedAt = undefined;
  this.confirmedAt = undefined;
  this.authCode = undefined;
  this.expiresAt = undefined;
  this.codeShownAt = undefined;
};

MinecraftPlayerSchema.methods.revokeWhitelist = function (revokedBy: string, reason?: string): void {
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason || "Revoked";
};

// Typed document interface for instance methods / virtuals
export interface IMinecraftPlayerDoc extends Document, InferSchemaType<typeof MinecraftPlayerSchema> {
  isWhitelisted: boolean;
  whitelistStatus: "pending" | "whitelisted" | "revoked";
  isLinked: boolean;
  hasActiveAuth: boolean;
  playerStatus: "unlinked" | "linking" | "linked";
  authStatus: "none" | "pending" | "expired" | "confirmed" | "revoked";
  startAuthProcess(discordId?: string): void;
  confirmAuth(discordId: string, approvedBy?: string): void;
  linkAccount(discordId: string, discordUsername?: string, displayName?: string): void;
  unlinkAccount(): void;
  revokeWhitelist(revokedBy: string, reason?: string): void;
}

export type IMinecraftPlayer = InferSchemaType<typeof MinecraftPlayerSchema>;

const MinecraftPlayer = (mongoose.models.MinecraftPlayer || model("MinecraftPlayer", MinecraftPlayerSchema)) as Model<IMinecraftPlayerDoc>;

export default MinecraftPlayer;
