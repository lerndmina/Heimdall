import { Schema, model, Document } from "mongoose";

export interface MinecraftConfigType extends Document {
  guildId: string;
  enabled: boolean;
  autoLinkOnJoin: boolean; // Send DM when user joins Discord
  staffRoleId: string; // Who can manage links

  // Server connection details
  serverHost: string;
  serverPort: number;

  // RCON for whitelisting (optional)
  rconEnabled: boolean;
  rconHost?: string;
  rconPort?: number;
  rconPassword?: string;

  // Authentication settings
  authCodeExpiry: number; // seconds instead of minutes
  maxPendingAuths: number;
  requireConfirmation: boolean;
  allowUsernameChange: boolean;
  autoWhitelist: boolean;

  // Messages
  authSuccessMessage: string;
  authRejectionMessage: string;
  whitelistSuccessMessage: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const MinecraftConfigSchema = new Schema<MinecraftConfigType>(
  {
    guildId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    enabled: {
      type: Boolean,
      default: false,
    },
    autoLinkOnJoin: {
      type: Boolean,
      default: true,
    },
    staffRoleId: {
      type: String,
      required: true,
    },

    // Server connection details
    serverHost: {
      type: String,
      required: true,
    },
    serverPort: {
      type: Number,
      default: 25565,
      min: 1,
      max: 65535,
    },

    // RCON for whitelisting
    rconEnabled: {
      type: Boolean,
      default: false,
    },
    rconHost: {
      type: String,
      required: function () {
        return this.rconEnabled;
      },
    },
    rconPort: {
      type: Number,
      default: 25575,
      min: 1,
      max: 65535,
    },
    rconPassword: {
      type: String,
      required: function () {
        return this.rconEnabled;
      },
    },

    // Authentication settings
    authCodeExpiry: {
      type: Number,
      default: 300, // 5 minutes in seconds
      min: 60, // 1 minute
      max: 3600, // 1 hour
    },
    maxPendingAuths: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
    },
    requireConfirmation: {
      type: Boolean,
      default: true,
    },
    allowUsernameChange: {
      type: Boolean,
      default: true,
    },
    autoWhitelist: {
      type: Boolean,
      default: false,
    },

    // Messages
    authSuccessMessage: {
      type: String,
      default: "§aYour auth code: §f{code}\n§7Go to Discord and type: §f/confirm-code {code}",
    },
    authRejectionMessage: {
      type: String,
      default:
        "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft {username}\n§7• Follow the instructions to link your account",
    },
    whitelistSuccessMessage: {
      type: String,
      default: "§aYou've been whitelisted! Please rejoin the server.",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
MinecraftConfigSchema.index({ guildId: 1 });

const MinecraftConfig = model<MinecraftConfigType>("MinecraftConfig", MinecraftConfigSchema);

export default MinecraftConfig;
