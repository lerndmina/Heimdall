/**
 * MinecraftConfig — Per-guild Minecraft integration configuration
 *
 * Stores server connection details, RCON settings, auth flow options,
 * role sync mappings, leave revocation policy, and customizable messages.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";

export interface RoleMapping {
  discordRoleId: string;
  discordRoleName: string;
  minecraftGroup: string;
  enabled: boolean;
}

const MinecraftConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: false },
    autoLinkOnJoin: { type: Boolean, default: true },
    staffRoleId: { type: String, required: true },

    // Server connection
    serverHost: { type: String, required: true },
    serverPort: { type: Number, default: 25565, min: 1, max: 65535 },

    // RCON
    rconEnabled: { type: Boolean, default: false },
    rconHost: { type: String },
    rconPort: { type: Number, default: 25575, min: 1, max: 65535 },
    rconPassword: { type: String },

    // Auth settings
    authCodeExpiry: { type: Number, default: 300, min: 60, max: 3600 },
    maxPendingAuths: { type: Number, default: 10, min: 1, max: 100 },
    requireConfirmation: { type: Boolean, default: true },
    allowUsernameChange: { type: Boolean, default: true },
    autoWhitelist: { type: Boolean, default: false },

    // Leave revocation
    leaveRevocation: {
      enabled: { type: Boolean, default: false },
      customMessage: {
        type: String,
        default: "❌ Your whitelist has been revoked because you left the Discord server. Please rejoin Discord and contact staff to restore access.",
      },
    },

    // Messages (Minecraft formatting codes)
    authSuccessMessage: {
      type: String,
      default: "§aYour auth code: §f{code}\n§7Go to Discord and type: §f/confirm-code {code}",
    },
    authRejectionMessage: {
      type: String,
      default: "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft {username}\n§7• Follow the instructions to link your account",
    },
    authPendingMessage: {
      type: String,
      default: "§eYour account is linked and waiting for staff approval.\n§7Please be patient while staff review your request.\n§7You will be automatically whitelisted once approved.",
    },
    applicationRejectionMessage: {
      type: String,
      default: "§cYour whitelist application has been rejected.\n§7Please contact staff for more information.",
    },

    // Role sync
    roleSync: {
      enabled: { type: Boolean, default: false },
      enableCaching: { type: Boolean, default: true },
      roleMappings: [
        {
          discordRoleId: { type: String, required: true },
          discordRoleName: { type: String, required: true },
          minecraftGroup: { type: String, required: true },
          enabled: { type: Boolean, default: true },
        },
      ],
    },
  },
  { timestamps: true },
);

export type IMinecraftConfig = InferSchemaType<typeof MinecraftConfigSchema>;

const MinecraftConfig = (mongoose.models.MinecraftConfig || model("MinecraftConfig", MinecraftConfigSchema)) as Model<IMinecraftConfig>;

export default MinecraftConfig;
