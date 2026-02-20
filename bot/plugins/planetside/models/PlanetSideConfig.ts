/**
 * PlanetSideConfig — Per-guild PlanetSide 2 integration configuration
 *
 * Stores outfit tracking, Census/Honu API settings, verification options,
 * role assignments, channel config, and leave revocation policy.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

const PlanetSideConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },

    // Outfit identity
    outfitId: { type: String },
    outfitTag: { type: String },
    outfitName: { type: String },

    // API settings
    censusServiceId: { type: String },
    honuBaseUrl: { type: String, default: "https://wt.honu.pw" },

    // Verification
    verificationMethod: {
      type: String,
      enum: ["online_now", "recent_login", "manual"],
      default: "online_now",
    },
    verificationWindowMinutes: { type: Number, default: 60, min: 5, max: 1440 },

    // Roles
    roles: {
      member: { type: String },
      guest: { type: String },
      promotion: { type: String },
    },

    // Channels
    channels: {
      log: { type: String },
      censusStatus: { type: String },
      censusStatusMessageId: { type: String },
      panel: { type: String },
      panelMessageId: { type: String },
    },

    // Leave revocation
    leaveRevocation: {
      enabled: { type: Boolean, default: false },
      restoreOnRejoin: { type: Boolean, default: true },
    },

    // Population source preference
    populationSource: {
      type: String,
      enum: ["honu", "fisu"],
      default: "honu",
    },

    // Self-unlink
    allowSelfUnlink: { type: Boolean, default: true },

    // Dashboard preferences
    defaultDashboardTab: {
      type: String,
      enum: ["players", "config", "status", "population"],
      default: "players",
    },
  },
  { timestamps: true },
);

export type IPlanetSideConfig = InferSchemaType<typeof PlanetSideConfigSchema>;

const PlanetSideConfig = (mongoose.models.PlanetSideConfig || model("PlanetSideConfig", PlanetSideConfigSchema)) as Model<IPlanetSideConfig>;

export default PlanetSideConfig;
