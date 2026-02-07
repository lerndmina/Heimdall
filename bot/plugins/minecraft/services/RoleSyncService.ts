/**
 * RoleSyncService — Discord role ↔ Minecraft permission group synchronization
 *
 * Calculates target groups from Discord roles using configured role mappings,
 * determines required changes, and logs sync operations.
 */

import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import MinecraftConfig, { type RoleMapping } from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import RoleSyncLog from "../models/RoleSyncLog.js";

const log = createLogger("minecraft:role-sync");

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
  private lib: LibAPI;

  constructor(lib: LibAPI) {
    this.lib = lib;
  }

  /** Map Discord roles → Minecraft groups using enabled mappings */
  static getTargetGroups(discordRoles: string[], roleMappings: RoleMapping[]): string[] {
    const groups: string[] = [];
    for (const roleId of discordRoles) {
      const mapping = roleMappings.find((m) => m.discordRoleId === roleId && m.enabled);
      if (mapping) groups.push(mapping.minecraftGroup);
    }
    return [...new Set(groups)];
  }

  /** Diff current vs target groups */
  static compareGroups(current: string[], target: string[]): { toAdd: string[]; toRemove: string[]; unchanged: string[] } {
    const currentSet = new Set(current);
    const targetSet = new Set(target);
    return {
      toAdd: target.filter((g) => !currentSet.has(g)),
      toRemove: current.filter((g) => !targetSet.has(g)),
      unchanged: current.filter((g) => targetSet.has(g)),
    };
  }

  /** Fetch a member's Discord roles (excluding @everyone) */
  async getPlayerDiscordRoles(guildId: string, discordId: string): Promise<string[]> {
    try {
      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return [];
      const member = await this.lib.thingGetter.getMember(guild, discordId);
      if (!member) return [];
      return member.roles.cache.map((r: { id: string }) => r.id).filter((id: string) => id !== guild.id);
    } catch (error) {
      log.error(`Failed to get Discord roles for ${discordId} in ${guildId}:`, error);
      return [];
    }
  }

  /** Calculate role sync changes for a player on login */
  async calculateRoleSync(
    guildId: string,
    playerId: string,
    currentMinecraftGroups: string[],
  ): Promise<{
    enabled: boolean;
    targetGroups: string[];
    managedGroups: string[];
    operation?: RoleSyncOperation;
  }> {
    try {
      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.roleSync?.enabled) return { enabled: false, targetGroups: [], managedGroups: [] };

      const player = await MinecraftPlayer.findById(playerId).lean();
      if (!player?.discordId) return { enabled: false, targetGroups: [], managedGroups: [] };
      if (player.roleSyncEnabled === false) return { enabled: false, targetGroups: [], managedGroups: [] };

      const discordRoles = await this.getPlayerDiscordRoles(guildId, player.discordId);
      const targetGroups = RoleSyncService.getTargetGroups(discordRoles, config.roleSync.roleMappings);
      const managedGroups = config.roleSync.roleMappings.filter((m) => m.enabled).map((m) => m.minecraftGroup);

      const comparison = RoleSyncService.compareGroups(currentMinecraftGroups, targetGroups);

      let operation: RoleSyncOperation | undefined;
      if (comparison.toAdd.length > 0 || comparison.toRemove.length > 0) {
        operation = {
          playerId: (player._id as any).toString(),
          minecraftUsername: player.minecraftUsername,
          discordId: player.discordId,
          syncTrigger: "login",
          discordRolesBefore: player.lastDiscordRoles || [],
          discordRolesAfter: discordRoles,
          minecraftGroupsBefore: currentMinecraftGroups,
          minecraftGroupsAfter: targetGroups,
          groupsAdded: comparison.toAdd,
          groupsRemoved: comparison.toRemove,
          success: true,
        };
      }

      // Update tracking fields
      await MinecraftPlayer.findByIdAndUpdate(playerId, {
        lastDiscordRoles: discordRoles,
        lastMinecraftGroups: currentMinecraftGroups,
        lastRoleSyncAt: new Date(),
      });

      return { enabled: true, targetGroups, managedGroups, operation };
    } catch (error) {
      log.error("calculateRoleSync failed:", error);
      return { enabled: false, targetGroups: [], managedGroups: [] };
    }
  }

  /** Persist a sync operation to the audit log */
  static async logRoleSync(guildId: string, operation: RoleSyncOperation): Promise<void> {
    try {
      await RoleSyncLog.create({ guildId, ...operation, timestamp: new Date() });
      log.info(`Role sync logged for ${operation.minecraftUsername}: +${operation.groupsAdded.join(",")} -${operation.groupsRemoved.join(",")}`);
    } catch (error) {
      log.error("Failed to log role sync operation:", error);
    }
  }

  /** Handle Discord role change event — update tracking, and if RCON mode, sync immediately */
  async handleDiscordRoleChange(guildId: string, discordId: string): Promise<void> {
    try {
      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.roleSync?.enabled) return;

      const player = await MinecraftPlayer.findOne({ guildId, discordId, roleSyncEnabled: true }).lean();
      if (!player) return;

      const currentDiscordRoles = await this.getPlayerDiscordRoles(guildId, discordId);
      await MinecraftPlayer.findByIdAndUpdate(player._id, { lastDiscordRoles: currentDiscordRoles });

      log.debug(`Updated Discord roles tracking for ${player.minecraftUsername}`);

      // If RCON mode, apply changes immediately
      if (config.roleSync.mode === "rcon") {
        const targetGroups = RoleSyncService.getTargetGroups(currentDiscordRoles, config.roleSync.roleMappings);
        const managedGroups = config.roleSync.roleMappings.filter((m) => m.enabled).map((m) => m.minecraftGroup);
        const currentMcGroups = (player.lastMinecraftGroups || []).filter((g: string) => managedGroups.includes(g));

        const comparison = RoleSyncService.compareGroups(currentMcGroups, targetGroups);

        if (comparison.toAdd.length > 0 || comparison.toRemove.length > 0) {
          const { RconService } = await import("./RconService.js");
          const result = await RconService.applyRoleSyncViaRcon(guildId, player.minecraftUsername, comparison.toAdd, comparison.toRemove);

          const operation: RoleSyncOperation = {
            playerId: (player._id as any).toString(),
            minecraftUsername: player.minecraftUsername,
            discordId: player.discordId ?? undefined,
            syncTrigger: "discord_role_change",
            discordRolesBefore: player.lastDiscordRoles || [],
            discordRolesAfter: currentDiscordRoles,
            minecraftGroupsBefore: currentMcGroups,
            minecraftGroupsAfter: targetGroups,
            groupsAdded: comparison.toAdd,
            groupsRemoved: comparison.toRemove,
            success: result.success,
            error: result.success ? undefined : "RCON command(s) failed",
          };

          await RoleSyncService.logRoleSync(guildId, operation);

          if (result.success) {
            // Update stored MC groups after successful sync
            await MinecraftPlayer.findByIdAndUpdate(player._id, { lastMinecraftGroups: targetGroups, lastRoleSyncAt: new Date() });
          }

          log.info(`RCON role sync (Discord change) for ${player.minecraftUsername}: +${comparison.toAdd.join(",")} -${comparison.toRemove.join(",")}, success=${result.success}`);
        }
      }
    } catch (error) {
      log.error("handleDiscordRoleChange failed:", error);
    }
  }

  /** Retrieve recent role sync logs */
  static async getRoleSyncLogs(guildId: string, limit: number = 50, playerId?: string): Promise<Record<string, unknown>[]> {
    try {
      const query: Record<string, unknown> = { guildId };
      if (playerId) query.playerId = playerId;
      const logs = await RoleSyncLog.find(query).sort({ timestamp: -1 }).limit(limit).lean();
      return logs as any;
    } catch (error) {
      log.error("Failed to get role sync logs:", error);
      return [];
    }
  }
}
