import { Schema, model, Document } from "mongoose";

export interface MinecraftPlayerType extends Document {
  guildId: string;

  // Player information
  minecraftUuid?: string; // Optional for imported players
  minecraftUsername: string;

  // Discord information (null if imported from existing whitelist)
  discordId?: string;
  discordUsername?: string; // Discord username at time of linking
  discordDisplayName?: string; // Server nickname or global display name at time of linking

  // Timestamps
  linkedAt?: Date;
  whitelistedAt?: Date; // null = not whitelisted, Date = whitelisted
  lastConnectionAttempt?: Date;

  // Auth code system (merged from MinecraftAuthPending)
  authCode?: string; // 6-digit code, null when not in auth flow
  expiresAt?: Date; // Code expiry time
  codeShownAt?: Date; // When plugin showed the code
  confirmedAt?: Date; // When user confirmed in Discord

  // Process tracking
  isExistingPlayerLink?: boolean; // True for existing players linking accounts
  rejectionReason?: string; // Reason for rejection

  // Audit trail
  approvedBy?: string; // Staff Discord ID
  revokedBy?: string;
  revokedAt?: Date;
  revocationReason?: string;

  // Metadata
  source: "imported" | "linked" | "manual"; // How they got added
  notes?: string; // Staff notes

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Helper methods
  isWhitelisted: boolean;
  whitelistStatus: "pending" | "whitelisted" | "revoked";
  isLinked: boolean;
  hasActiveAuth: boolean;
  authStatus: "none" | "pending" | "shown" | "confirmed" | "expired";
  playerStatus: "unlinked" | "linking" | "linked";
  canStartNewAuth(): boolean;
  isAuthExpired(): boolean;
  clearExpiredAuth(): void;
  startAuthProcess(discordId?: string): void;
  confirmAuth(discordId: string, approvedBy?: string): void;
}

const MinecraftPlayerSchema = new Schema<MinecraftPlayerType>(
  {
    guildId: {
      type: String,
      required: true,
      index: true,
    },

    // Player information
    minecraftUuid: {
      type: String,
      sparse: true,
    },
    minecraftUsername: {
      type: String,
      required: true,
    },

    // Discord information
    discordId: {
      type: String,
      sparse: true,
    },
    discordUsername: {
      type: String,
      sparse: true,
    },
    discordDisplayName: {
      type: String,
      sparse: true,
    },

    // Timestamps
    linkedAt: { type: Date },
    whitelistedAt: { type: Date }, // null = not whitelisted, Date = whitelisted
    lastConnectionAttempt: { type: Date },

    // Auth code system (merged from MinecraftAuthPending)
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
    source: {
      type: String,
      enum: ["imported", "linked", "manual"],
      default: "linked",
    },
    notes: { type: String },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
// Note: We use a partial index for UUID uniqueness to only apply when UUID exists and is a string
MinecraftPlayerSchema.index(
  { guildId: 1, minecraftUuid: 1 },
  {
    unique: true,
    partialFilterExpression: {
      minecraftUuid: { $exists: true, $type: "string" },
    },
  }
);
MinecraftPlayerSchema.index({ guildId: 1, minecraftUsername: 1 }, { unique: true });
MinecraftPlayerSchema.index({ guildId: 1, discordId: 1 }, { sparse: true });
MinecraftPlayerSchema.index({ guildId: 1, whitelistedAt: 1 }); // For whitelist status queries

// New indexes for auth system
MinecraftPlayerSchema.index({ authCode: 1 }, { sparse: true, unique: true }); // For auth code lookups
MinecraftPlayerSchema.index({ guildId: 1, authCode: 1, expiresAt: 1 }); // For pending auth queries
MinecraftPlayerSchema.index({ guildId: 1, linkedAt: 1, whitelistedAt: 1 }); // For dashboard queries
MinecraftPlayerSchema.index({ guildId: 1, confirmedAt: 1, linkedAt: 1 }); // For code confirmation queries

// Helper methods
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

MinecraftPlayerSchema.virtual("authStatus").get(function () {
  if (!this.authCode || !this.expiresAt) return "none";
  if (this.confirmedAt) return "confirmed";
  if (this.expiresAt < new Date()) return "expired";
  if (this.codeShownAt) return "shown";
  return "pending";
});

MinecraftPlayerSchema.virtual("playerStatus").get(function () {
  if (this.isLinked) return "linked";
  if (this.hasActiveAuth) return "linking";
  return "unlinked";
});

MinecraftPlayerSchema.methods.canStartNewAuth = function () {
  return !this.hasActiveAuth;
};

MinecraftPlayerSchema.methods.isAuthExpired = function () {
  return !!this.expiresAt && this.expiresAt < new Date();
};

MinecraftPlayerSchema.methods.clearExpiredAuth = function () {
  if (this.isAuthExpired()) {
    this.authCode = null;
    this.expiresAt = null;
    this.codeShownAt = null;
    // Don't clear confirmedAt - that's permanent history
  }
};

MinecraftPlayerSchema.methods.startAuthProcess = function (discordId?: string) {
  this.authCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.codeShownAt = new Date();
  if (discordId) {
    this.discordId = discordId;
  }
};

MinecraftPlayerSchema.methods.confirmAuth = function (discordId: string, approvedBy?: string) {
  if (!this.hasActiveAuth) {
    throw new Error("No active auth process to confirm");
  }

  this.confirmedAt = new Date();
  this.discordId = discordId;
  this.whitelistedAt = new Date();
  if (approvedBy) {
    this.approvedBy = approvedBy;
  }
};

const MinecraftPlayer = model<MinecraftPlayerType>("MinecraftPlayer", MinecraftPlayerSchema);

export default MinecraftPlayer;
