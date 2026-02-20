/**
 * PlanetSideLeaveService — Role revocation on Discord leave / restoration on rejoin
 *
 * Mirrors MinecraftLeaveService pattern.
 */

import { createLogger } from "../../../src/core/Logger.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";

const log = createLogger("planetside:leave-service");

export class PlanetSideLeaveService {
  /** Revoke linked account when a user leaves Discord */
  static async revokeOnLeave(guildId: string, discordId: string): Promise<void> {
    try {
      const config = await PlanetSideConfig.findOne({ guildId }).lean();
      if (!config?.leaveRevocation?.enabled) return;

      const players = await PlanetSidePlayer.find({
        guildId,
        discordId,
        linkedAt: { $ne: null },
        revokedAt: null,
      }).lean();

      if (players.length === 0) return;

      const results = await Promise.allSettled(
        players.map((player) =>
          PlanetSidePlayer.findByIdAndUpdate(player._id, {
            revokedAt: new Date(),
            revokedBy: "system",
            revocationReason: "User left Discord server",
            $push: {
              auditTrail: {
                action: "revoke",
                performedBy: "system",
                timestamp: new Date(),
                reason: "User left Discord server",
              },
            },
          }),
        ),
      );

      let success = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
          log.info(`Revoked PS2 link for ${players[i]!.characterName} (Discord leave)`);
        } else {
          log.error(`Failed to revoke ${players[i]!.characterName}:`, r.reason);
        }
      });

      log.info(`Leave revocation for ${discordId}: ${success}/${players.length} succeeded`);
    } catch (error) {
      log.error("revokeOnLeave failed:", error);
    }
  }

  /** Auto-restore linked players who were revoked due to leaving and have now rejoined */
  static async autoRestoreOnRejoin(guildId: string, discordId: string): Promise<void> {
    try {
      const config = await PlanetSideConfig.findOne({ guildId }).lean();
      if (!config?.leaveRevocation?.enabled) return;

      const revokedPlayers = await PlanetSidePlayer.find({
        guildId,
        discordId,
        revokedAt: { $ne: null },
        linkedAt: { $ne: null },
      }).lean();

      if (revokedPlayers.length === 0) return;

      // Only restore those revoked for leaving Discord
      const leaveReasons = ["user left discord server", "left discord server", "discord leave"];
      const eligible = revokedPlayers.filter((p) => p.revocationReason && leaveReasons.some((r) => p.revocationReason!.toLowerCase().includes(r)));

      if (eligible.length === 0) return;

      const results = await Promise.allSettled(
        eligible.map((player) =>
          PlanetSidePlayer.findByIdAndUpdate(player._id, {
            revokedAt: null,
            revokedBy: null,
            revocationReason: null,
            $push: {
              auditTrail: {
                action: "restore",
                performedBy: "system",
                timestamp: new Date(),
                reason: "User rejoined Discord server",
              },
            },
          }),
        ),
      );

      let success = 0;
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          success++;
          log.info(`Auto-restored PS2 link for ${eligible[i]!.characterName} (rejoin)`);
        } else {
          log.error(`Failed to restore ${eligible[i]!.characterName}:`, r.reason);
        }
      });

      log.info(`Rejoin auto-restore for ${discordId}: ${success}/${eligible.length} restored`);
    } catch (error) {
      log.error("autoRestoreOnRejoin failed:", error);
    }
  }
}
