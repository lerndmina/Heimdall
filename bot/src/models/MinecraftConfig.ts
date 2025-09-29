import { Schema, model, Document } from "mongoose";

export interface RoleMapping {
  discordRoleId: string;
  discordRoleName: string; // cached for display
  minecraftGroup: string;
  enabled: boolean;
}

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

  // Role sync settings
  roleSync: {
    enabled: boolean;
    enableCaching: boolean; // toggle for whitelist caching
    roleMappings: RoleMapping[];
  };

  // Leave revocation settings
  leaveRevocation?: {
    enabled: boolean;
    customMessage: string;
  };

  // Messages
  authSuccessMessage: string;
  authRejectionMessage: string;
  authPendingMessage: string;
  applicationRejectionMessage: string;

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

    // Leave revocation settings
    leaveRevocation: {
      enabled: {
        type: Boolean,
        default: false,
      },
      customMessage: {
        type: String,
        default:
          "❌ Your whitelist has been revoked because you left the Discord server. Please rejoin Discord and contact staff to restore access.",
      },
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
    authPendingMessage: {
      type: String,
      default:
        "§eYour account is linked and waiting for staff approval.\n§7Please be patient while staff review your request.\n§7You will be automatically whitelisted once approved.",
    },
    applicationRejectionMessage: {
      type: String,
      default:
        "§cYour whitelist application has been rejected.\n§7Please contact staff for more information.",
    },

    // Role sync settings
    roleSync: {
      enabled: {
        type: Boolean,
        default: false,
      },
      enableCaching: {
        type: Boolean,
        default: true,
      },
      roleMappings: [
        {
          discordRoleId: {
            type: String,
            required: true,
          },
          discordRoleName: {
            type: String,
            required: true,
          },
          minecraftGroup: {
            type: String,
            required: true,
          },
          enabled: {
            type: Boolean,
            default: true,
          },
        },
      ],
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
