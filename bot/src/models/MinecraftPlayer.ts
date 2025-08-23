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

  // Status tracking
  whitelistStatus: "whitelisted" | "unwhitelisted";

  // Timestamps
  linkedAt?: Date;
  whitelistedAt?: Date;
  lastConnectionAttempt?: Date;

  // Audit trail
  approvedBy?: string; // Staff Discord ID
  revokedBy?: string;
  revokedAt?: Date;

  // Metadata
  source: "imported" | "linked" | "manual"; // How they got added
  notes?: string; // Staff notes

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
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

    // Status tracking
    whitelistStatus: {
      type: String,
      enum: ["whitelisted", "unwhitelisted"],
      default: "unwhitelisted",
      index: true,
    },

    // Timestamps
    linkedAt: { type: Date },
    whitelistedAt: { type: Date },
    lastConnectionAttempt: { type: Date },

    // Audit trail
    approvedBy: { type: String },
    revokedBy: { type: String },
    revokedAt: { type: Date },

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
MinecraftPlayerSchema.index({ guildId: 1, whitelistStatus: 1 });

const MinecraftPlayer = model<MinecraftPlayerType>("MinecraftPlayer", MinecraftPlayerSchema);

export default MinecraftPlayer;
