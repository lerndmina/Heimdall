import { PermissionsBitField } from "discord.js";
import type { BotPermissions, PermissionContext, PermissionResult, PermissionConfig } from "../types/Permissions";
import { createLogger, LogLevel } from "@heimdall/logger";

/**
 * Simple and practical permission manager for Discord bots
 */
export class PermissionManager {
  private logger = createLogger("permission-manager", {
    minLevel: process.env.DEBUG_LOG === "true" ? LogLevel.DEBUG : LogLevel.INFO,
    enableFileLogging: process.env.LOG_TO_FILE === "true",
    timestampFormat: "locale",
    showCallerInfo: true,
    callerPathDepth: 2,
  });

  private config: PermissionConfig;

  constructor(config: Partial<PermissionConfig> = {}) {
    this.config = {
      enabled: true,
      defaultAllow: true,
      logChecks: false,
      ...config,
    };
  }

  /**
   * Check if a user has permission to use a command
   */
  async checkPermissions(context: PermissionContext, permissions?: BotPermissions): Promise<PermissionResult> {
    if (!this.config.enabled) {
      return { allowed: true, reason: "Permission checking disabled" };
    }

    if (!permissions) {
      return { allowed: this.config.defaultAllow, reason: this.config.defaultAllow ? "No permissions specified" : "No permissions configured" };
    }

    try {
      // Check denied users first (highest priority)
      if (permissions.deniedUsers?.includes(context.userId)) {
        this.logCheck(context, false, "User is in denied users list");
        return { allowed: false, reason: "You are not allowed to use this command." };
      }

      // Check denied roles
      if (permissions.deniedRoles && context.member) {
        const userRoles = context.member.roles.cache.map((role) => role.id);
        const hasDeniedRole = permissions.deniedRoles.some((roleId) => userRoles.includes(roleId));
        if (hasDeniedRole) {
          this.logCheck(context, false, "User has a denied role");
          return { allowed: false, reason: "Your role is not allowed to use this command." };
        }
      }

      // Check denied channels
      if (permissions.deniedChannels?.includes(context.channelId)) {
        this.logCheck(context, false, "Command used in denied channel");
        return { allowed: false, reason: "This command cannot be used in this channel." };
      }

      // Check allowed users (override other restrictions)
      if (permissions.allowedUsers?.includes(context.userId)) {
        this.logCheck(context, true, "User is in allowed users list");
        return { allowed: true, reason: "User explicitly allowed" };
      }

      // Check allowed channels
      if (permissions.allowedChannels && !permissions.allowedChannels.includes(context.channelId)) {
        this.logCheck(context, false, "Channel not in allowed channels list");
        return { allowed: false, reason: "This command cannot be used in this channel." };
      }

      // Check allowed roles
      if (permissions.allowedRoles && context.member) {
        const userRoles = context.member.roles.cache.map((role) => role.id);
        const hasAllowedRole = permissions.allowedRoles.some((roleId) => userRoles.includes(roleId));
        if (!hasAllowedRole) {
          this.logCheck(context, false, "User doesn't have any allowed roles");
          return { allowed: false, reason: "You don't have the required role to use this command." };
        }
      }

      // Check user Discord permissions
      if (permissions.user && context.member && context.guild) {
        const missingUserPerms = this.checkDiscordPermissions(context.member.permissions, permissions.user);
        if (missingUserPerms.length > 0) {
          this.logCheck(context, false, `User missing permissions: ${missingUserPerms.join(", ")}`);
          return {
            allowed: false,
            reason: `You need the following permissions: ${missingUserPerms.join(", ")}`,
            missingUserPermissions: missingUserPerms,
          };
        }
      }

      // Check bot Discord permissions
      if (permissions.bot && context.guild) {
        const botMember = context.guild.members.cache.get(context.guild.client.user.id);
        if (botMember) {
          const missingBotPerms = this.checkDiscordPermissions(botMember.permissions, permissions.bot);
          if (missingBotPerms.length > 0) {
            this.logCheck(context, false, `Bot missing permissions: ${missingBotPerms.join(", ")}`);
            return {
              allowed: false,
              reason: `I need the following permissions: ${missingBotPerms.join(", ")}`,
              missingBotPermissions: missingBotPerms,
            };
          }
        }
      }

      // Run custom permission check
      if (permissions.custom) {
        const customResult = await permissions.custom(context);
        if (!customResult) {
          this.logCheck(context, false, "Custom permission check failed");
          return { allowed: false, reason: "Custom permission check failed." };
        }
      }

      // All checks passed
      this.logCheck(context, true, "All permission checks passed");
      return { allowed: true, reason: "Permission granted" };
    } catch (error) {
      this.logger.error("Error checking permissions:", error);
      return { allowed: false, reason: "Permission check error occurred." };
    }
  }

  /**
   * Check Discord permissions against required permissions
   */
  private checkDiscordPermissions(userPermissions: PermissionsBitField, requiredPermissions: (keyof typeof PermissionsBitField.Flags)[]): string[] {
    const missing: string[] = [];

    for (const permission of requiredPermissions) {
      if (!userPermissions.has(permission)) {
        missing.push(permission);
      }
    }

    return missing;
  }

  /**
   * Log permission check if logging is enabled
   */
  private logCheck(context: PermissionContext, allowed: boolean, reason: string): void {
    if (this.config.logChecks) {
      this.logger.debug(`Permission check for ${context.userId} on command ${context.command.name}: ${allowed ? "ALLOWED" : "DENIED"} - ${reason}`);
    }
  }

  /**
   * Quick helper to check if user has specific Discord permissions
   */
  async hasDiscordPermissions(context: PermissionContext, permissions: (keyof typeof PermissionsBitField.Flags)[]): Promise<{ hasPermission: boolean; missing: string[] }> {
    if (!context.member || !context.guild) {
      return { hasPermission: false, missing: permissions };
    }

    const missing = this.checkDiscordPermissions(context.member.permissions, permissions);
    return {
      hasPermission: missing.length === 0,
      missing,
    };
  }

  /**
   * Quick helper to check if bot has specific Discord permissions
   */
  async botHasDiscordPermissions(context: PermissionContext, permissions: (keyof typeof PermissionsBitField.Flags)[]): Promise<{ hasPermission: boolean; missing: string[] }> {
    if (!context.guild) {
      return { hasPermission: false, missing: permissions };
    }

    const botMember = context.guild.members.cache.get(context.guild.client.user.id);
    if (!botMember) {
      return { hasPermission: false, missing: permissions };
    }

    const missing = this.checkDiscordPermissions(botMember.permissions, permissions);
    return {
      hasPermission: missing.length === 0,
      missing,
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<PermissionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PermissionConfig> {
    return { ...this.config };
  }
}
