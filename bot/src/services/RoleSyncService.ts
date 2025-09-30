import { Client, Guild } from "discord.js";
import MinecraftConfig, { type RoleMapping } from "../models/MinecraftConfig";
import MinecraftPlayer from "../models/MinecraftPlayer";
import RoleSyncLog, { type RoleSyncLogType } from "../models/RoleSyncLog";
import { tryCatch } from "../utils/trycatch";
import log from "../utils/log";

export interface RoleSyncOperation {
  playerId: string;
  minecraftUsername: string;
  discordId?: string;
  syncTrigger: "login" | "discord_role_change" | "manual";
  discordRolesBefore: string[];
  discordRolesAfter: string[];
  minecraftGroupsBefore: string[];
  minecraftGroupsAfter: string[];
  groupsAdded: string[];
  groupsRemoved: string[];
  success: boolean;
  error?: string;
}

export class RoleSyncService {
  constructor(private client?: Client) {}

  /**
   * Get target Minecraft groups based on Discord roles and role mappings
   */
  static getTargetGroups(discordRoles: string[], roleMappings: RoleMapping[]): string[] {
    const targetGroups: string[] = [];

    for (const roleId of discordRoles) {
      const mapping = roleMappings.find((m) => m.discordRoleId === roleId && m.enabled);
      if (mapping) {
        targetGroups.push(mapping.minecraftGroup);
      }
    }

    // Remove duplicates and return
    return [...new Set(targetGroups)];
  }

  /**
   * Compare current vs target groups and determine what changes are needed
   */
  static compareGroups(
    current: string[],
    target: string[]
  ): {
    toAdd: string[];
    toRemove: string[];
    unchanged: string[];
  } {
    const currentSet = new Set(current);
    const targetSet = new Set(target);

    const toAdd = target.filter((group) => !currentSet.has(group));
    const toRemove = current.filter((group) => !targetSet.has(group));
    const unchanged = current.filter((group) => targetSet.has(group));

    return { toAdd, toRemove, unchanged };
  }

  /**
   * Get player's current Discord roles
   */
  async getPlayerDiscordRoles(guildId: string, discordId: string): Promise<string[]> {
    if (!this.client) return [];

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return [];

      const member = await guild.members.fetch(discordId);
      if (!member) return [];

      return member.roles.cache.map((role) => role.id).filter((id) => id !== guild.id); // Exclude @everyone
    } catch (error) {
      log.error(`Failed to get Discord roles for user ${discordId} in guild ${guildId}:`, error);
      return [];
    }
  }

  /**
   * Calculate role sync for a player on login
   */
  async calculateRoleSync(
    guildId: string,
    playerId: string,
    currentMinecraftGroups: string[]
  ): Promise<{
    enabled: boolean;
    targetGroups: string[];
    operation?: RoleSyncOperation;
  }> {
    // Get config and check if role sync is enabled
    const { data: config, error: configError } = await tryCatch(
      MinecraftConfig.findOne({ guildId }).lean()
    );

    if (configError || !config || !config.roleSync?.enabled) {
      return { enabled: false, targetGroups: [] };
    }

    // Get player data
    const { data: player, error: playerError } = await tryCatch(
      MinecraftPlayer.findById(playerId).lean()
    );

    if (playerError || !player || !player.discordId) {
      return { enabled: false, targetGroups: [] };
    }

    // Check if role sync is enabled for this player (default to true for backward compatibility)
    if (player.roleSyncEnabled === false) {
      return { enabled: false, targetGroups: [] };
    }

    // Get current Discord roles
    const discordRoles = await this.getPlayerDiscordRoles(guildId, player.discordId);
    log.debug(`Discord roles for ${player.minecraftUsername} (${player.discordId}):`, discordRoles);

    // Calculate target groups based on Discord roles
    const targetGroups = RoleSyncService.getTargetGroups(
      discordRoles,
      config.roleSync.roleMappings
    );
    log.debug(`Target groups for ${player.minecraftUsername}:`, targetGroups);
    log.debug(`Role mappings:`, config.roleSync.roleMappings);

    // Compare with current groups
    const comparison = RoleSyncService.compareGroups(currentMinecraftGroups, targetGroups);

    // Create operation record if changes are needed
    let operation: RoleSyncOperation | undefined;
    if (comparison.toAdd.length > 0 || comparison.toRemove.length > 0) {
      operation = {
        playerId: player._id.toString(),
        minecraftUsername: player.minecraftUsername,
        discordId: player.discordId,
        syncTrigger: "login",
        discordRolesBefore: player.lastDiscordRoles || [],
        discordRolesAfter: discordRoles,
        minecraftGroupsBefore: currentMinecraftGroups,
        minecraftGroupsAfter: targetGroups,
        groupsAdded: comparison.toAdd,
        groupsRemoved: comparison.toRemove,
        success: true, // Will be updated by plugin
      };
    }

    // Update player's role tracking
    await tryCatch(
      MinecraftPlayer.findByIdAndUpdate(playerId, {
        lastDiscordRoles: discordRoles,
        lastMinecraftGroups: currentMinecraftGroups,
        lastRoleSyncAt: new Date(),
      })
    );

    return {
      enabled: true,
      targetGroups,
      operation,
    };
  }

  /**
   * Log a role sync operation
   */
  static async logRoleSync(guildId: string, operation: RoleSyncOperation): Promise<void> {
    const { error } = await tryCatch(
      RoleSyncLog.create({
        guildId,
        ...operation,
        timestamp: new Date(),
      })
    );

    if (error) {
      log.error("Failed to log role sync operation:", error);
    } else {
      log.info(
        `Role sync logged for ${operation.minecraftUsername}: +${operation.groupsAdded.join(
          ","
        )} -${operation.groupsRemoved.join(",")}`
      );
    }
  }

  /**
   * Handle Discord role changes for a user
   */
  async handleDiscordRoleChange(
    guildId: string,
    discordId: string,
    addedRoles: string[],
    removedRoles: string[]
  ): Promise<void> {
    // Get config and check if role sync is enabled
    const { data: config, error: configError } = await tryCatch(
      MinecraftConfig.findOne({ guildId }).lean()
    );

    if (configError || !config || !config.roleSync?.enabled) {
      return;
    }

    // Find linked player
    const { data: player, error: playerError } = await tryCatch(
      MinecraftPlayer.findOne({
        guildId,
        discordId,
        roleSyncEnabled: true,
      }).lean()
    );

    if (playerError || !player) {
      return; // Player not linked or role sync disabled
    }

    // Get current Discord roles
    const currentDiscordRoles = await this.getPlayerDiscordRoles(guildId, discordId);

    // Calculate target groups
    const targetGroups = RoleSyncService.getTargetGroups(
      currentDiscordRoles,
      config.roleSync.roleMappings
    );

    // Log the potential change (actual sync happens on next login)
    log.info(
      `Discord role change detected for ${player.minecraftUsername}: roles +${addedRoles.join(
        ","
      )} -${removedRoles.join(",")}, target groups: ${targetGroups.join(",")}`
    );

    // Update player's Discord roles tracking
    await tryCatch(
      MinecraftPlayer.findByIdAndUpdate(player._id, {
        lastDiscordRoles: currentDiscordRoles,
      })
    );
  }

  /**
   * Get role sync logs for a guild
   */
  static async getRoleSyncLogs(
    guildId: string,
    limit: number = 50,
    playerId?: string
  ): Promise<RoleSyncLogType[]> {
    const query: any = { guildId };
    if (playerId) {
      query.playerId = playerId;
    }

    const { data: logs, error } = await tryCatch(
      RoleSyncLog.find(query).sort({ timestamp: -1 }).limit(limit).lean()
    );

    if (error) {
      log.error("Failed to get role sync logs:", error);
      return [];
    }

    return logs || [];
  }
}

export default RoleSyncService;
