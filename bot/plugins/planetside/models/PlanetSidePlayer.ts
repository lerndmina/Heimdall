/**
 * PlanetSidePlayer — Per-guild PlanetSide 2 linked player records
 *
 * Tracks character linking, outfit membership, verification status,
 * and audit trail for each player–Discord account association.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model, type Document } from "mongoose";

const PlanetSidePlayerSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },

    // PS2 identity
    characterId: { type: String, required: true },
    characterName: { type: String, required: true },
    factionId: { type: Number },
    serverId: { type: Number },

    // Discord identity
    discordId: { type: String, sparse: true },
    discordUsername: { type: String, sparse: true },
    discordDisplayName: { type: String, sparse: true },

    // Outfit info (cached)
    isInOutfit: { type: Boolean, default: false },
    outfitId: { type: String },
    outfitTag: { type: String },
    outfitName: { type: String },
    outfitRank: { type: String },

    // Stats (cached)
    battleRank: { type: Number },
    prestige: { type: Number, default: 0 },

    // Linking status
    linkedAt: { type: Date },
    linkedBy: { type: String, default: "self" },
    unlinkedAt: { type: Date },

    // Verification
    verifiedAt: { type: Date },
    verificationMethod: { type: String, enum: ["online_now", "recent_login", "manual"] },
    verificationStatus: { type: String, enum: ["pending", "verified", "failed"], default: "pending" },
    verificationStartedAt: { type: Date },
    verificationResult: { type: String },
    lastVerifiedAt: { type: Date },

    // Audit trail
    revokedAt: { type: Date },
    revokedBy: { type: String },
    revocationReason: { type: String },

    auditTrail: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],

    // Metadata
    source: { type: String, enum: ["linked", "manual", "imported"], default: "linked" },
    notes: { type: String },
  },
  { timestamps: true },
);

// Compound indexes
PlanetSidePlayerSchema.index({ guildId: 1, characterId: 1 }, { unique: true });
PlanetSidePlayerSchema.index({ guildId: 1, discordId: 1 }, { sparse: true });
PlanetSidePlayerSchema.index({ guildId: 1, linkedAt: 1 });
PlanetSidePlayerSchema.index({ guildId: 1, isInOutfit: 1 });

// ── Virtuals ───────────────────────────────────────────────────

PlanetSidePlayerSchema.virtual("isLinked").get(function () {
  return !!this.linkedAt && !this.revokedAt;
});

PlanetSidePlayerSchema.virtual("playerStatus").get(function () {
  if (this.revokedAt) return "revoked";
  if (this.linkedAt) return "linked";
  return "unlinked";
});

PlanetSidePlayerSchema.virtual("factionName").get(function () {
  switch (this.factionId) {
    case 1:
      return "Vanu Sovereignty";
    case 2:
      return "New Conglomerate";
    case 3:
      return "Terran Republic";
    case 4:
      return "NSO";
    default:
      return "Unknown";
  }
});

PlanetSidePlayerSchema.virtual("factionEmoji").get(function () {
  switch (this.factionId) {
    case 1:
      return "🟣";
    case 2:
      return "🔵";
    case 3:
      return "🔴";
    case 4:
      return "⚪";
    default:
      return "❓";
  }
});

// ── Instance methods ───────────────────────────────────────────

PlanetSidePlayerSchema.methods.linkAccount = function (discordId: string, discordUsername?: string, displayName?: string): void {
  this.discordId = discordId;
  this.linkedAt = new Date();
  if (discordUsername) this.discordUsername = discordUsername;
  if (displayName) this.discordDisplayName = displayName;
};

PlanetSidePlayerSchema.methods.unlinkAccount = function (): void {
  this.unlinkedAt = new Date();
  this.revokedAt = new Date();
  this.revokedBy = "self";
  this.revocationReason = "Self-unlinked";
};

PlanetSidePlayerSchema.methods.revokeLink = function (revokedBy: string, reason?: string): void {
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason || "Revoked by staff";
};

// Typed document interface
export interface IPlanetSidePlayerDoc extends Document, InferSchemaType<typeof PlanetSidePlayerSchema> {
  isLinked: boolean;
  playerStatus: "unlinked" | "linked" | "revoked";
  factionName: string;
  factionEmoji: string;
  linkAccount(discordId: string, discordUsername?: string, displayName?: string): void;
  unlinkAccount(): void;
  revokeLink(revokedBy: string, reason?: string): void;
}

export type IPlanetSidePlayer = InferSchemaType<typeof PlanetSidePlayerSchema>;

const PlanetSidePlayer = (mongoose.models.PlanetSidePlayer || model("PlanetSidePlayer", PlanetSidePlayerSchema)) as Model<IPlanetSidePlayerDoc>;

export default PlanetSidePlayer;
