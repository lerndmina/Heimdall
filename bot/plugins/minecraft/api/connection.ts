/**
 * POST /api/guilds/:guildId/minecraft/connection-attempt
 *
 * Called by the Java Minecraft plugin on EVERY player connection attempt.
 * Handles: whitelist checking, auth code display, username changes, role sync.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { RconService } from "../services/RconService.js";
import { RoleSyncService } from "../services/RoleSyncService.js";
import { createLogger } from "../../../src/core/Logger.js";
import { escapeRegex } from "../../lib/utils/escapeRegex.js";
import crypto from "crypto";

const log = createLogger("minecraft:api:connection");

export function createConnectionRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.post("/connection-attempt", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const { username, uuid, ip, serverIp, currentlyWhitelisted, currentGroups } = req.body;

      if (!username || !uuid) {
        res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "username and uuid are required" } });
        return;
      }

      const config = await MinecraftConfig.findOne({ guildId }).lean();
      if (!config?.enabled) {
        res.status(404).json({ success: false, error: { code: "NOT_CONFIGURED", message: "Minecraft integration not enabled" } });
        return;
      }

      const now = new Date();

      // Update player by UUID and keep username in sync (avoids duplicate records on rename)
      let player = await MinecraftPlayer.findOneAndUpdate({ guildId, minecraftUuid: uuid }, { $set: { minecraftUsername: username, lastConnectionAttempt: now } }, { new: true });

      if (!player) {
        // Fallback: migrate existing username record to this UUID (legacy or pre-link entries)
        player = await MinecraftPlayer.findOneAndUpdate(
          { guildId, minecraftUsername: { $regex: new RegExp(`^${escapeRegex(username)}$`, "i") } },
          { $set: { minecraftUuid: uuid, minecraftUsername: username, lastConnectionAttempt: now } },
          { new: true },
        );
      }

      if (!player) {
        // Unknown player with no record — don't create a phantom record.
        // They need to use /link-minecraft in Discord first.
        const message = config.authRejectionMessage || "§cYou are not whitelisted. Use /link-minecraft in Discord to get started.";

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace("{player}", username).replace("{username}", username),
          },
        });
        return;
      }

      // Check whitelist status
      const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;

      if (isWhitelisted) {
        // Calculate role sync if available
        let roleSync = null;
        if (config.roleSync?.enabled && player.discordId) {
          try {
            const syncResult = await deps.roleSyncService.calculateRoleSync(guildId as string, player._id.toString(), currentGroups || []);

            if (syncResult) {
              const mode = config.roleSync.mode || "on_join";

              if (mode === "rcon") {
                // Bot handles role sync via RCON — tell the plugin NOT to sync
                roleSync = { enabled: false };

                // Fire RCON commands asynchronously (don't block the response)
                if (syncResult.operation && (syncResult.operation.groupsAdded.length > 0 || syncResult.operation.groupsRemoved.length > 0)) {
                  RconService.applyRoleSyncViaRcon(guildId as string, username, syncResult.operation.groupsAdded, syncResult.operation.groupsRemoved)
                    .then((result) => {
                      if (result.success) {
                        log.info(`RCON role sync for ${username}: +${syncResult.operation!.groupsAdded.join(",")} -${syncResult.operation!.groupsRemoved.join(",")}`);
                      } else {
                        log.error(`RCON role sync failed for ${username}:`, result.results);
                      }
                      // Log the operation regardless
                      return RoleSyncService.logRoleSync(guildId as string, syncResult.operation!);
                    })
                    .catch((err) => log.error("RCON role sync error:", err));
                }
              } else {
                // "on_join" mode — Java plugin handles sync via LuckPerms
                roleSync = {
                  enabled: syncResult.enabled,
                  targetGroups: syncResult.targetGroups,
                  managedGroups: syncResult.managedGroups,
                };

                // Log the operation if there were changes
                if (syncResult.operation) {
                  RoleSyncService.logRoleSync(guildId as string, syncResult.operation).catch((err) => log.error("Role sync log error:", err));
                }
              }
            }
          } catch (error) {
            log.error("Role sync calculation failed:", error);
          }
        }

        const message = config.authSuccessMessage || "§aWelcome back, {player}!";

        res.json({
          success: true,
          data: {
            whitelisted: true,
            message: message.replace("{player}", username),
            roleSync,
          },
        });
        return;
      }

      // Not whitelisted — check for pending auth (not yet confirmed)
      const hasAuth = player.authCode && player.expiresAt && player.expiresAt > new Date() && !player.confirmedAt;

      if (hasAuth) {
        // Mark that code was shown to player
        if (!player.codeShownAt) {
          player.codeShownAt = new Date();
          await player.save();
        }

        const message = config.authPendingMessage || "§eYour authentication code is: §6{code}\n§7Go back to Discord and click §fConfirm Code §7to complete linking.";

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace(/\{code\}/g, player.authCode!).replace("{player}", username),
            pendingAuth: true,
            authCode: player.authCode,
          },
        });
        return;
      }

      // Expired auth code — regenerate automatically for better UX
      if (player.authCode && player.expiresAt && player.expiresAt <= new Date() && !player.linkedAt) {
        const newCode = crypto.randomInt(100000, 1000000).toString();
        const newExpiry = new Date(Date.now() + (config.authCodeExpiry || 300) * 1000);

        player.authCode = newCode;
        player.expiresAt = newExpiry;
        player.codeShownAt = new Date();
        await player.save();

        const message = config.authPendingMessage || "§eYour authentication code is: §6{code}\n§7Go back to Discord and click §fConfirm Code §7to complete linking.";

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace(/\{code\}/g, newCode).replace("{player}", username),
            pendingAuth: true,
            authCode: newCode,
          },
        });
        return;
      }

      // Check if player has been revoked — give specific message
      if (player.revokedAt) {
        const reason = (player.revocationReason || "").trim();
        const reasonSegment = reason ? `${reason}` : "";
        const revokedTemplate = config.whitelistRevokedMessage || "§cYour whitelist has been revoked{reason}.\n§7Please contact staff for more information.";
        const message = revokedTemplate.replace("{reason}", reasonSegment);

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace("{player}", username),
            revoked: true,
          },
        });
        return;
      }

      // Check if linked but not whitelisted (awaiting approval or scheduled)
      if (player.linkedAt && !player.whitelistedAt) {
        let message: string;

        if (config.autoWhitelist && config.whitelistSchedule?.type && config.whitelistSchedule.type !== "immediate") {
          // Auto-whitelist is on but scheduled — tell the player when
          let schedule = "soon";
          if (config.whitelistSchedule.type === "delay") {
            const mins = config.whitelistSchedule.delayMinutes ?? 0;
            schedule = mins >= 1440 ? `in approximately ${Math.round(mins / 1440)} day(s)` : mins >= 60 ? `in approximately ${Math.round(mins / 60)} hour(s)` : `in approximately ${mins} minute(s)`;
          } else if (config.whitelistSchedule.type === "scheduled_day") {
            const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const day = days[config.whitelistSchedule.scheduledDay ?? 0] ?? "the scheduled day";
            const totalMins = config.whitelistSchedule.scheduledHour ?? 0;
            const hh = String(Math.floor(totalMins / 60)).padStart(2, "0");
            const mm = String(totalMins % 60).padStart(2, "0");
            schedule = `on ${day} at ${hh}:${mm} UTC`;
          }

          message = (config.whitelistPendingScheduledMessage || "§eYou will be whitelisted {schedule}.\n§7Please check back later!").replace("{schedule}", schedule).replace("{player}", username);
        } else {
          // Staff approval required
          message = (config.whitelistPendingApprovalMessage || "§eYour whitelist application is pending staff approval.\n§7Please wait for a staff member to review your request.").replace(
            "{player}",
            username,
          );
        }

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace("{player}", username),
            pendingApproval: true,
          },
        });
        return;
      }

      // Check for existing-player linking opportunity
      if (currentlyWhitelisted && !player.discordId) {
        // Player is on whitelist but not linked — offer linking
        const authCode = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        player.authCode = authCode;
        player.expiresAt = expiresAt;
        player.codeShownAt = new Date();
        player.isExistingPlayerLink = true;
        player.whitelistedAt = player.whitelistedAt || new Date();
        await player.save();

        const message = "§eLink your Discord account!\n" + "§eUse §6/confirm-code {code}§e in Discord\n" + "§eCode expires in 15 minutes.";

        res.json({
          success: true,
          data: {
            whitelisted: true,
            message: message.replace(/\{code\}/g, authCode).replace("{player}", username),
            existingPlayerLink: true,
            authCode,
          },
        });
        return;
      }

      // Not linked, not whitelisted, no pending auth
      const message = config.authRejectionMessage || "§cYou are not whitelisted. Use /link-minecraft in Discord to get started.";

      res.json({
        success: true,
        data: {
          whitelisted: false,
          message: message.replace("{player}", username).replace("{username}", username),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
