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

      // Upsert player by UUID (track all connections)
      let player = await MinecraftPlayer.findOne({ guildId, minecraftUuid: uuid });

      if (!player) {
        // Check by username (may be a pending auth from /link-minecraft — no UUID yet)
        player = await MinecraftPlayer.findOne({
          guildId,
          minecraftUsername: { $regex: new RegExp(`^${username}$`, "i") },
          $or: [{ minecraftUuid: { $exists: false } }, { minecraftUuid: null }],
        });

        if (player) {
          player.minecraftUuid = uuid;
        }
      }

      if (player) {
        // Handle username change (Mojang allows name changes)
        if (player.minecraftUsername.toLowerCase() !== username.toLowerCase()) {
          // Check if the new username conflicts with another player
          const duplicate = await MinecraftPlayer.findOne({
            guildId,
            minecraftUsername: { $regex: new RegExp(`^${username}$`, "i") },
            minecraftUuid: { $ne: uuid },
          }).lean();

          if (!duplicate) {
            player.minecraftUsername = username;
          }
        }

        player.lastConnectionAttempt = new Date();
        await player.save();
      } else {
        // Unknown player with no record — don't create a phantom record.
        // They need to use /link-minecraft in Discord first.
        const message = config.authRejectionMessage || "§cYou are not whitelisted. Use /link-minecraft in Discord to get started.";

        res.json({
          success: true,
          data: {
            whitelisted: false,
            message: message.replace("{player}", username),
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

      // Not whitelisted — check for pending auth
      const hasAuth = player.authCode && player.expiresAt && player.expiresAt > new Date();

      if (hasAuth) {
        // Mark that code was shown to player
        if (!player.codeShownAt) {
          player.codeShownAt = new Date();
          await player.save();
        }

        const message = config.authPendingMessage || "§eYour authentication code is: §6{code}§e\nUse /confirm-code {code} in Discord.";

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
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newExpiry = new Date(Date.now() + (config.authCodeExpiry || 300) * 1000);

        player.authCode = newCode;
        player.expiresAt = newExpiry;
        player.codeShownAt = new Date();
        await player.save();

        const message = config.authPendingMessage || "§eYour authentication code is: §6{code}§e\nUse /confirm-code {code} in Discord.";

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
        const message = player.revocationReason
          ? `§cYour whitelist has been revoked: §f${player.revocationReason}`
          : config.applicationRejectionMessage || "§cYour whitelist has been revoked. Please contact staff for more information.";

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

      // Check if linked but not whitelisted (awaiting approval)
      if (player.linkedAt && !player.whitelistedAt) {
        const message = config.applicationRejectionMessage || "§cYour whitelist application is pending approval. Please wait for staff review.";

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
        const authCode = Math.floor(100000 + Math.random() * 900000).toString();
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
          message: message.replace("{player}", username),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
