import MinecraftConfig from "../models/MinecraftConfig";
import MinecraftPlayer from "../models/MinecraftPlayer";
import { tryCatch } from "../utils/trycatch";
import log from "../utils/log";

export class MinecraftLeaveService {
  /**
   * Revoke whitelist for all linked players when a user leaves Discord
   */
  static async revokePlayerOnLeave(guildId: string, discordId: string): Promise<void> {
    try {
      // Check if leave revocation is enabled for this guild
      const config = await this.getLeaveRevocationConfig(guildId);
      if (!config?.leaveRevocation?.enabled) {
        return; // Feature not enabled, do nothing
      }

      // Find all linked players for this Discord user
      const players = await this.findLinkedPlayersForUser(guildId, discordId);
      if (players.length === 0) {
        return; // No linked players found
      }

      // Revoke all linked players
      const revocationResults = await Promise.allSettled(
        players.map((player) => this.revokePlayer(player, "User left Discord server"))
      );

      // Log results
      let successCount = 0;
      let errorCount = 0;

      revocationResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount++;
          log.info(
            `Revoked whitelist for ${players[index].minecraftUsername} due to Discord leave`,
            {
              guildId,
              discordId,
              playerId: players[index]._id,
              minecraftUsername: players[index].minecraftUsername,
            }
          );
        } else {
          errorCount++;
          log.error(`Failed to revoke whitelist for ${players[index].minecraftUsername}`, {
            guildId,
            discordId,
            playerId: players[index]._id,
            error: result.reason,
          });
        }
      });

      log.info(`Leave revocation completed for Discord user ${discordId}`, {
        guildId,
        discordId,
        totalPlayers: players.length,
        successCount,
        errorCount,
      });
    } catch (error) {
      log.error("Failed to process leave revocation", {
        guildId,
        discordId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get leave revocation configuration for a guild
   */
  static async getLeaveRevocationConfig(guildId: string): Promise<any> {
    const { data: config, error } = await tryCatch(MinecraftConfig.findOne({ guildId }).lean());

    if (error) {
      log.error("Failed to fetch minecraft config for leave revocation", { guildId, error });
      return null;
    }

    return config;
  }

  /**
   * Find all linked Minecraft players for a Discord user
   */
  static async findLinkedPlayersForUser(guildId: string, discordId: string): Promise<any[]> {
    const { data: players, error } = await tryCatch(
      MinecraftPlayer.find({
        guildId,
        discordId,
        whitelistedAt: { $ne: null }, // Only whitelisted players
        revokedAt: null, // Not already revoked
      }).lean()
    );

    if (error) {
      log.error("Failed to find linked players for user", { guildId, discordId, error });
      return [];
    }

    return players || [];
  }

  /**
   * Revoke a specific player
   */
  private static async revokePlayer(player: any, reason: string): Promise<void> {
    const { error } = await tryCatch(
      MinecraftPlayer.findByIdAndUpdate(player._id, {
        whitelistedAt: null, // Remove whitelist
        revokedAt: new Date(),
        revokedBy: "system", // System revocation
        revocationReason: reason,
      })
    );

    if (error) {
      throw new Error(`Failed to revoke player ${player.minecraftUsername}: ${error.message}`);
    }
  }

  /**
   * Check if a player should be auto-whitelisted when rejoining Discord
   * Only for players revoked due to leaving Discord
   */
  static async shouldAutoWhitelistOnRejoin(player: any): Promise<boolean> {
    if (!player.revokedAt || !player.revocationReason) {
      return false; // Not revoked or no reason
    }

    // Check if revocation was due to leaving Discord
    const leaveReasons = ["User left Discord server", "left Discord server", "Discord leave"];

    return leaveReasons.some((reason) =>
      player.revocationReason.toLowerCase().includes(reason.toLowerCase())
    );
  }

  /**
   * Auto-whitelist a player who rejoined Discord after leave revocation
   */
  static async autoWhitelistOnRejoin(guildId: string, discordId: string): Promise<void> {
    try {
      // Find players that were revoked due to leaving Discord
      const { data: players, error } = await tryCatch(
        MinecraftPlayer.find({
          guildId,
          discordId,
          revokedAt: { $ne: null }, // Was revoked
          whitelistedAt: null, // Not currently whitelisted
        }).lean()
      );

      if (error || !players || players.length === 0) {
        return; // No revoked players found
      }

      // Filter to only those revoked for leaving Discord
      const leaveRevokedPlayers = players.filter((player) =>
        this.shouldAutoWhitelistOnRejoin(player)
      );

      if (leaveRevokedPlayers.length === 0) {
        return; // No leave-revoked players to restore
      }

      // Restore whitelist for eligible players
      const restoreResults = await Promise.allSettled(
        leaveRevokedPlayers.map((player) => this.restorePlayer(player))
      );

      // Log results
      let successCount = 0;
      let errorCount = 0;

      restoreResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount++;
          log.info(
            `Auto-restored whitelist for ${leaveRevokedPlayers[index].minecraftUsername} on Discord rejoin`,
            {
              guildId,
              discordId,
              playerId: leaveRevokedPlayers[index]._id,
            }
          );
        } else {
          errorCount++;
          log.error(
            `Failed to restore whitelist for ${leaveRevokedPlayers[index].minecraftUsername}`,
            {
              guildId,
              discordId,
              playerId: leaveRevokedPlayers[index]._id,
              error: result.reason,
            }
          );
        }
      });

      log.info(`Auto-whitelist restoration completed for Discord user ${discordId}`, {
        guildId,
        discordId,
        totalPlayers: leaveRevokedPlayers.length,
        successCount,
        errorCount,
      });
    } catch (error) {
      log.error("Failed to process auto-whitelist on rejoin", {
        guildId,
        discordId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Restore a player's whitelist status
   */
  private static async restorePlayer(player: any): Promise<void> {
    const { error } = await tryCatch(
      MinecraftPlayer.findByIdAndUpdate(player._id, {
        whitelistedAt: new Date(), // Restore whitelist
        revokedAt: null, // Clear revocation
        revokedBy: null,
        revocationReason: null,
        notes: `Auto-restored on Discord rejoin at ${new Date().toISOString()}`,
      })
    );

    if (error) {
      throw new Error(`Failed to restore player ${player.minecraftUsername}: ${error.message}`);
    }
  }
}

export default MinecraftLeaveService;
