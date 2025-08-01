import type { RepliableInteraction, Guild, GuildMember } from "discord.js";
import type { LoadedCommand } from "./Command";

export enum PermissionType {
  ROLE = "role",
  USER = "user",
  CHANNEL = "channel",
  CUSTOM = "custom",
  TIME_BASED = "time_based",
}

export interface PermissionRule {
  id: string;
  type: PermissionType;
  value: string | string[];
  allow: boolean;
  priority: number; // Higher number = higher priority
  expiry?: Date;
  conditions?: PermissionCondition[];
  metadata?: Record<string, any>;
}

export interface PermissionCondition {
  type: "time_range" | "day_of_week" | "user_property" | "guild_property" | "custom";
  value: any;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "in" | "not_in";
}

export interface CommandPermissions {
  rules: PermissionRule[];
  inheritFromCategory: boolean;
  customValidator?: (context: PermissionContext) => Promise<boolean>;
  defaultAllow: boolean; // Default action if no rules match
  requireAllRules: boolean; // Require all rules to pass vs any rule
}

export interface PermissionContext {
  userId: string;
  guildId?: string;
  channelId: string;
  memberRoles?: string[];
  member?: GuildMember;
  guild?: Guild;
  command: LoadedCommand;
  interaction: RepliableInteraction;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  appliedRules: PermissionRule[];
  deniedBy?: PermissionRule;
  allowedBy?: PermissionRule;
  bypassedRules: PermissionRule[];
}

export interface PermissionConfig {
  enableAdvancedPermissions: boolean;
  enableCategoryInheritance: boolean;
  enableTimeBasedPermissions: boolean;
  enableCustomValidators: boolean;
  defaultPermissionBehavior: "allow" | "deny";
  cachePermissions: boolean;
  cacheTtl: number; // Cache TTL in milliseconds
  logPermissionChecks: boolean;
}

export interface CategoryPermissions {
  categoryName: string;
  permissions: CommandPermissions;
  inheritToCommands: boolean;
  overrideCommandPermissions: boolean;
}

export interface PermissionCache {
  key: string;
  result: PermissionResult;
  expiry: number;
  contextHash: string;
}
