/**
 * MinecraftLeaveService — Whitelist revocation on Discord leave / restoration on rejoin
 */

import { createLogger } from "../../../src/core/Logger.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";

const log = createLogger("minecraft:leave-service");

export class MinecraftLeaveService {
  /** Revoke whitelist for all linked players when a user leaves Discord */
  static async revokePlayerOnLeave(guildId: string, discordId: string): Promise<void> {
    try {
      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.leaveRevocation?.enabled) return;

      const players = await MinecraftPlayer.find({
        guildId,
        discordId,
        whitelistedAt: { $ne: null },
        revokedAt: null,
      }).lean();

      if (players.length === 0) return;

      const results = await Promise.allSettled(
        players.map((player) =>
          MinecraftPlayer.findByIdAndUpdate(player._id, {
            whitelistedAt: null,
            revokedAt: new Date(),
            revokedBy: "system",
            revocationReason: "User left Discord server",
          }),
        ),
      );

      let success = 0;
      let fail = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
          log.info(`Revoked whitelist for ${players[i]!.minecraftUsername} (Discord leave)`);
        } else {
          fail++;
          log.error(`Failed to revoke ${players[i]!.minecraftUsername}:`, r.reason);
        }
      });

      log.info(`Leave revocation for ${discordId}: ${success}/${players.length} succeeded`);
    } catch (error) {
      log.error("revokePlayerOnLeave failed:", error);
    }
  }

  /** Auto-whitelist players who were revoked due to leaving and have now rejoined */
  static async autoWhitelistOnRejoin(guildId: string, discordId: string): Promise<void> {
    try {
      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.leaveRevocation?.enabled) return;

      const revokedPlayers = await MinecraftPlayer.find({
        guildId,
        discordId,
        revokedAt: { $ne: null },
        whitelistedAt: null,
      }).lean();

      if (revokedPlayers.length === 0) return;

      // Only restore those revoked for leaving Discord
      const leaveReasons = ["user left discord server", "left discord server", "discord leave"];
      const eligible = revokedPlayers.filter((p) => p.revocationReason && leaveReasons.some((r) => p.revocationReason!.toLowerCase().includes(r)));

      if (eligible.length === 0) return;

      const results = await Promise.allSettled(
        eligible.map((player) =>
          MinecraftPlayer.findByIdAndUpdate(player._id, {
            whitelistedAt: new Date(),
            revokedAt: null,
            revokedBy: null,
            revocationReason: null,
            notes: `Auto-restored on Discord rejoin at ${new Date().toISOString()}`,
          }),
        ),
      );

      let success = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
          log.info(`Auto-restored whitelist for ${eligible[i]!.minecraftUsername} (rejoin)`);
        } else {
          log.error(`Failed to restore ${eligible[i]!.minecraftUsername}:`, r.reason);
        }
      });

      log.info(`Rejoin auto-whitelist for ${discordId}: ${success}/${eligible.length} restored`);
    } catch (error) {
      log.error("autoWhitelistOnRejoin failed:", error);
    }
  }
}
