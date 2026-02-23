/**
 * MinecraftConfig — Per-guild Minecraft integration configuration
 *
 * Stores server connection details, RCON settings, auth flow options,
 * role sync mappings, leave revocation policy, and customizable messages.
 */

import mongoose, { Schema, model, type InferSchemaType, type Model } from "mongoose";
import crypto from "crypto";

/**
 * Encrypt a value using AES-256-CBC with the global ENCRYPTION_KEY.
 */
export function encryptRconPassword(value: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is required for RCON password encryption");
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt a value encrypted with encryptRconPassword.
 */
export function decryptRconPassword(encryptedValue: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is required for RCON password decryption");
  const [ivHex, encrypted] = encryptedValue.split(":");
  if (!ivHex || !encrypted) throw new Error("Invalid encrypted RCON password format");
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.scryptSync(encryptionKey, "salt", 32);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

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
    staffRoleId: { type: String },

    // Server identity
    serverName: { type: String, default: "" },
    enableMinecraftPlugin: { type: Boolean, default: false },

    // Server connection
    serverHost: { type: String, required: true },
    serverPort: { type: Number, default: 25565, min: 1, max: 65535 },

    // RCON
    rconEnabled: { type: Boolean, default: false },
    rconHost: { type: String },
    rconPort: { type: Number, default: 25575, min: 1, max: 65535 },
    rconPassword: { type: String }, // Legacy plaintext (migrated to encrypted)
    encryptedRconPassword: { type: String }, // AES-256-CBC encrypted

    // Auth settings
    authCodeExpiry: { type: Number, default: 300, min: 60, max: 3600 },
    maxPendingAuths: { type: Number, default: 10, min: 1, max: 100 },
    requireConfirmation: { type: Boolean, default: true },
    allowUsernameChange: { type: Boolean, default: true },
    autoWhitelist: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false },
    whitelistSchedule: {
      type: { type: String, enum: ["immediate", "delay", "scheduled_day"], default: "immediate" },
      delayMinutes: { type: Number, default: 0, min: 0 },
      scheduledDay: { type: Number, default: 0, min: 0, max: 6 },
      scheduledHour: { type: Number, default: 0, min: 0, max: 1439 },
    },
    maxPlayersPerUser: { type: Number, default: 1, min: 1, max: 10 },
    allowSelfUnlink: { type: Boolean, default: true },

    // Linking panel channel (where the persistent "Link Account" panel is posted)
    linkPanelChannelId: { type: String },
    linkPanelMessageId: { type: String },

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
      default: "§aWelcome back, {player}!",
    },
    authRejectionMessage: {
      type: String,
      default: "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft {username}\n§7• Follow the instructions to link your account",
    },
    authPendingMessage: {
      type: String,
      default: "§eYour authentication code is: §6{code}\n§7Go back to Discord and click §fConfirm Code §7to complete linking.",
    },
    applicationRejectionMessage: {
      type: String,
      default: "§cYour whitelist application has been rejected.\n§7Please contact staff for more information.",
    },
    whitelistRevokedMessage: {
      type: String,
      default: "§cYour whitelist has been revoked{reason}.\n§7Please contact staff for more information.",
    },
    whitelistPendingApprovalMessage: {
      type: String,
      default: "§eYour whitelist application is pending staff approval.\n§7Please wait for a staff member to review your request.",
    },
    whitelistPendingScheduledMessage: {
      type: String,
      default: "§eYou will be whitelisted {schedule}.\n§7Please check back later!",
    },

    // Role sync
    roleSync: {
      enabled: { type: Boolean, default: false },
      /** 'on_join' = Java plugin handles via LuckPerms on login, 'rcon' = Bot sends RCON commands immediately */
      mode: { type: String, enum: ["on_join", "rcon"], default: "on_join" },
      enableCaching: { type: Boolean, default: true },
      /** LuckPerms command templates for RCON sync. {player} and {group} are replaced at runtime. */
      rconAddCommand: { type: String, default: "lp user {player} parent add {group}" },
      rconRemoveCommand: { type: String, default: "lp user {player} parent remove {group}" },
      roleMappings: [
        {
          discordRoleId: { type: String, required: true },
          discordRoleName: { type: String, required: true },
          minecraftGroup: { type: String, required: true },
          enabled: { type: Boolean, default: true },
        },
      ],
    },

    // Dashboard preferences
    defaultDashboardTab: { type: String, enum: ["players", "pending", "config", "status"], default: "players" },
  },
  { timestamps: true },
);

export type IMinecraftConfig = InferSchemaType<typeof MinecraftConfigSchema>;

const MinecraftConfig = (mongoose.models.MinecraftConfig || model("MinecraftConfig", MinecraftConfigSchema)) as Model<IMinecraftConfig>;

export default MinecraftConfig;
