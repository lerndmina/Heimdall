/**
 * ModmailPermissions - Permission checking utilities for modmail operations
 *
 * Provides methods to check various permission levels:
 * - isStaff: Check if member has modmail staff permissions
 * - canBanUsers: Check if member can ban users from modmail
 * - canClose: Check if member can close a modmail thread
 * - isCategoryStaff: Check if member is staff for a specific category
 */

import { PermissionFlagsBits, type GuildMember } from "discord.js";
import ModmailConfig, { type IModmailConfig, type ModmailCategory } from "../models/ModmailConfig.js";

/**
 * ModmailPermissions - Static utility class for permission checks
 */
export class ModmailPermissions {
  /**
   * Check if a member has modmail staff permissions
   * Staff = ManageMessages permission OR has a global staff role OR has any category staff role
   */
  static async isStaff(member: GuildMember, guildId: string): Promise<boolean> {
    // Server-level permission overrides all
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    // Get config to check role-based staff
    const config = await ModmailConfig.findOne({ guildId });
    if (!config) {
      return false;
    }

    return ModmailPermissions.isStaffWithConfig(member, config);
  }

  /**
   * Check if a member has staff permissions using pre-fetched config
   * Avoids duplicate database queries when config is already available
   */
  static isStaffWithConfig(member: GuildMember, config: IModmailConfig): boolean {
    // Server-level permission overrides all
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    // Check global staff roles
    if (config.globalStaffRoleIds?.some((roleId) => member.roles.cache.has(roleId))) {
      return true;
    }

    // Check category-specific staff roles (any category)
    for (const category of config.categories || []) {
      if (category.staffRoleIds?.some((roleId) => member.roles.cache.has(roleId))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a member can ban users from modmail
   * Requires ManageMessages OR BanMembers permission
   */
  static canBanUsers(member: GuildMember): boolean {
    return member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.BanMembers);
  }

  /**
   * Check if a member can close a modmail thread
   * Allowed for: thread creator OR staff members
   */
  static async canClose(member: GuildMember, guildId: string, creatorId: string): Promise<boolean> {
    // Creator can always close their own thread
    if (member.id === creatorId) {
      return true;
    }

    // Staff can close any thread
    return ModmailPermissions.isStaff(member, guildId);
  }

  /**
   * Check if a member can close a modmail thread using pre-fetched config
   */
  static canCloseWithConfig(member: GuildMember, config: IModmailConfig, creatorId: string): boolean {
    // Creator can always close their own thread
    if (member.id === creatorId) {
      return true;
    }

    // Staff can close any thread
    return ModmailPermissions.isStaffWithConfig(member, config);
  }

  /**
   * Check if a member is staff for a specific category
   * More restrictive than isStaff - only checks category-specific roles
   */
  static async isCategoryStaff(member: GuildMember, guildId: string, categoryId: string): Promise<boolean> {
    // Server-level permission overrides all
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    const config = await ModmailConfig.findOne({ guildId });
    if (!config) {
      return false;
    }

    return ModmailPermissions.isCategoryStaffWithConfig(member, config, categoryId);
  }

  /**
   * Check if a member is staff for a specific category using pre-fetched config
   */
  static isCategoryStaffWithConfig(member: GuildMember, config: IModmailConfig, categoryId: string): boolean {
    // Server-level permission overrides all
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }

    // Check global staff roles (global staff has access to all categories)
    if (config.globalStaffRoleIds?.some((roleId) => member.roles.cache.has(roleId))) {
      return true;
    }

    // Find the specific category
    const category = config.categories?.find((cat) => cat.id === categoryId);
    if (!category) {
      return false;
    }

    // Check category-specific staff roles
    return category.staffRoleIds?.some((roleId) => member.roles.cache.has(roleId)) ?? false;
  }

  /**
   * Get all categories a member has staff access to
   */
  static getCategoriesWithAccess(member: GuildMember, config: IModmailConfig): ModmailCategory[] {
    // ManageMessages or global staff = all categories
    if (member.permissions.has(PermissionFlagsBits.ManageMessages) || config.globalStaffRoleIds?.some((roleId) => member.roles.cache.has(roleId))) {
      return config.categories || [];
    }

    // Filter to categories where member has a staff role
    return (config.categories || []).filter((category) => category.staffRoleIds?.some((roleId) => member.roles.cache.has(roleId)));
  }

  /**
   * Check if a member can claim/unclaim threads
   * Same as isStaff - any staff member can claim threads
   */
  static async canClaim(member: GuildMember, guildId: string): Promise<boolean> {
    return ModmailPermissions.isStaff(member, guildId);
  }

  /**
   * Check if a member can escalate threads
   * Requires staff permissions
   */
  static async canEscalate(member: GuildMember, guildId: string): Promise<boolean> {
    return ModmailPermissions.isStaff(member, guildId);
  }

  /**
   * Check if a member can view thread history/logs
   * Requires staff permissions
   */
  static async canViewHistory(member: GuildMember, guildId: string): Promise<boolean> {
    return ModmailPermissions.isStaff(member, guildId);
  }
}

export default ModmailPermissions;
