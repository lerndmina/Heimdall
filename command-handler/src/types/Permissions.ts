import type { RepliableInteraction, Guild, GuildMember, PermissionsBitField } from "discord.js";
import type { LoadedCommand } from "./Command";

/**
 * Simple permission checking for Discord bots
 */
export interface BotPermissions {
  /** Discord permissions required by the bot */
  bot?: (keyof typeof PermissionsBitField.Flags)[];
  /** Discord permissions required by the user */
  user?: (keyof typeof PermissionsBitField.Flags)[];
  /** Role IDs that are allowed to use this command */
  allowedRoles?: string[];
  /** Role IDs that are denied from using this command */
  deniedRoles?: string[];
  /** User IDs that are allowed to use this command */
  allowedUsers?: string[];
  /** User IDs that are denied from using this command */
  deniedUsers?: string[];
  /** Channel IDs where this command is allowed */
  allowedChannels?: string[];
  /** Channel IDs where this command is denied */
  deniedChannels?: string[];
  /** Custom permission validator function */
  custom?: (context: PermissionContext) => Promise<boolean> | boolean;
}

export interface PermissionContext {
  userId: string;
  guildId?: string;
  channelId: string;
  member?: GuildMember | null;
  guild?: Guild | null;
  command: LoadedCommand;
  interaction: RepliableInteraction;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  missingBotPermissions?: string[];
  missingUserPermissions?: string[];
}

export interface PermissionConfig {
  /** Enable permission checking */
  enabled: boolean;
  /** Default behavior when no permissions are specified */
  defaultAllow: boolean;
  /** Log permission checks for debugging */
  logChecks: boolean;
}
