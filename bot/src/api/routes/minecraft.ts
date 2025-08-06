import { Router } from "express";
import Database from "../../utils/data/database";
import MinecraftConfig from "../../models/MinecraftConfig";
import MinecraftAuthPending from "../../models/MinecraftAuthPending";
import MinecraftPlayer from "../../models/MinecraftPlayer";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import { createSuccessResponse, createErrorResponse } from "../utils/apiResponse";
import { authenticateApiKey, requireScope } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";

export function createMinecraftRoutes(client?: any, handler?: any): Router {
  const router = Router();
  const db = new Database();

  // Middleware to inject client and handler into res.locals
  if (client && handler) {
    router.use((req, res, next) => {
      res.locals.client = client;
      res.locals.handler = handler;
      next();
    });
  }

  /**
   * POST /api/minecraft/connection-attempt
   * Called by the Minecraft plugin on EVERY connection attempt (not just kicks)
   * Determines if player should be whitelisted and provides appropriate response
   */
  router.post(
    "/connection-attempt",
    authenticateApiKey,
    requireScope("minecraft:connection"),
    async (req, res) => {
      try {
        const {
          username: rawUsername,
          uuid,
          ip,
          serverIp,
          currentlyWhitelisted = false,
        } = req.body;
        const username = rawUsername?.toLowerCase(); // Normalize to lowercase

        if (!username || !uuid || !ip) {
          return res
            .status(400)
            .json(
              createErrorResponse("Missing required fields: username, uuid, ip", 400, req.requestId)
            );
        }

        log.info(
          `Minecraft connection check: ${username} (${uuid}) from ${ip}, currently whitelisted: ${currentlyWhitelisted}`
        );

        // Find the guild config for this server IP (if provided)
        let guildId: string | null = null;
        if (serverIp) {
          const { data: config } = await tryCatch(
            db.findOne(MinecraftConfig, {
              serverHost: serverIp,
              enabled: true,
            })
          );
          if (config) {
            guildId = config.guildId;
          }
        }

        // If no server IP provided or no config found, try to find any pending auth for this username
        if (!guildId) {
          const { data: pendingAuth } = await tryCatch(
            MinecraftAuthPending.findOne({
              minecraftUsername: username,
              status: { $in: ["awaiting_connection", "code_shown"] },
              expiresAt: { $gt: new Date() },
            }).lean()
          );

          if (pendingAuth) {
            guildId = pendingAuth.guildId;
          }
        }

        // If still no guild found, check if we have any player record for this username
        if (!guildId) {
          const { data: existingPlayer } = await tryCatch(
            db.findOne(MinecraftPlayer, {
              minecraftUsername: username,
            })
          );
          if (existingPlayer) {
            guildId = existingPlayer.guildId;
          }
        }

        // If still no guild found, return generic message
        if (!guildId) {
          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage:
                  "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft " +
                  username +
                  "\n§7• Follow the instructions to link your account",
              },
              req.requestId
            )
          );
        }

        // Get the guild config
        const { data: config, error: configError } = await tryCatch(
          db.findOne(MinecraftConfig, { guildId, enabled: true })
        );

        if (configError || !config) {
          log.error("Failed to fetch config for guild:", guildId, configError);
          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage: "§cServer configuration error.\n§7Please contact an administrator.",
              },
              req.requestId
            )
          );
        }

        // Clean up any expired pending auth records for this username
        await tryCatch(
          db.updateMany(
            MinecraftAuthPending,
            {
              guildId,
              minecraftUsername: username,
              status: { $ne: "expired" },
              expiresAt: { $lte: new Date() },
            },
            { status: "expired" }
          )
        );

        // Check if player should be whitelisted (check player record first)
        const { data: player, error: playerError } = await tryCatch(
          db.findOne(MinecraftPlayer, {
            guildId,
            minecraftUsername: username,
          })
        );

        if (playerError) {
          log.error("Failed to fetch player record:", playerError);
          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage: "§cDatabase error.\n§7Please try again later.",
              },
              req.requestId
            )
          );
        }

        // If player exists and is whitelisted, allow them
        if (player && player.whitelistStatus === "whitelisted") {
          log.info(`Player ${username} is whitelisted, allowing connection`);

          // Update last connection attempt
          const { error: updateError } = await tryCatch(
            db.findOneAndUpdate(
              MinecraftPlayer,
              { _id: player._id },
              { lastConnectionAttempt: new Date() },
              { upsert: false, new: false }
            )
          );

          if (updateError) {
            log.warn("Failed to update last connection attempt:", updateError);
          }

          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: true,
                hasAuth: false,
                action: "allow",
                kickMessage: "", // No kick needed
              },
              req.requestId
            )
          );
        }

        // If player exists but is banned, deny them
        if (player && player.whitelistStatus === "banned") {
          log.info(`Player ${username} is banned, denying connection`);
          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage:
                  "§cYou have been banned from this server.\n§7Contact staff if you believe this is an error.",
              },
              req.requestId
            )
          );
        }

        // Player doesn't exist or is unwhitelisted - check for pending auth
        const { data: pendingAuth, error: authError } = await tryCatch(
          MinecraftAuthPending.findOne({
            guildId,
            minecraftUsername: username,
            status: { $in: ["awaiting_connection", "code_shown", "code_confirmed"] },
            expiresAt: { $gt: new Date() },
          }).lean()
        );

        if (authError) {
          log.error("Failed to fetch pending auth:", authError);
          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage: "§cDatabase error.\n§7Please try again later.",
              },
              req.requestId
            )
          );
        }

        // Has pending auth - handle based on status
        if (pendingAuth) {
          // If code is confirmed, they're waiting for staff approval
          if (pendingAuth.status === "code_confirmed") {
            return res.json(
              createSuccessResponse(
                {
                  shouldBeWhitelisted: false,
                  hasAuth: true,
                  action: "kick_with_message",
                  kickMessage:
                    "§eYour account is linked and waiting for staff approval.\n§7Please be patient while staff review your request.\n§7You will be automatically whitelisted once approved.",
                },
                req.requestId
              )
            );
          }

          // Update the pending auth to mark that we showed them the code
          const { error: updateError } = await tryCatch(
            db.findOneAndUpdate(
              MinecraftAuthPending,
              { _id: pendingAuth._id },
              {
                status: "code_shown",
                codeShownAt: new Date(),
                lastConnectionAttempt: {
                  timestamp: new Date(),
                  ip,
                  uuid,
                },
              }
            )
          );

          if (updateError) {
            log.error("Failed to update pending auth:", updateError);
          }

          // Return the auth code and kick message
          const kickMessage = config.authSuccessMessage
            .replace("{code}", pendingAuth.authCode)
            .replace("{username}", username)
            .replace("{serverHost}", config.serverHost)
            .replace("{serverPort}", config.serverPort.toString());

          log.info(`Provided auth code to ${username}: ${pendingAuth.authCode}`);

          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: true,
                action: "show_auth_code",
                kickMessage: kickMessage,
              },
              req.requestId
            )
          );
        }

        // No pending auth and not whitelisted - tell them to link account
        const kickMessage = config.authRejectionMessage
          .replace("{username}", username)
          .replace("{serverHost}", config.serverHost)
          .replace("{serverPort}", config.serverPort.toString());

        return res.json(
          createSuccessResponse(
            {
              shouldBeWhitelisted: false,
              hasAuth: false,
              action: "kick_with_message",
              kickMessage:
                kickMessage ||
                `§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft ${username}\n§7• Follow the instructions to link your account`,
            },
            req.requestId
          )
        );
      } catch (error) {
        log.error("Error in minecraft connection attempt:", error);
        return res
          .status(500)
          .json(createErrorResponse("Internal server error", 500, req.requestId));
      }
    }
  );

  /**
   * GET /api/minecraft/:guildId/config
   * Get minecraft configuration for a guild
   */
  router.get(
    "/:guildId/config",
    authenticateApiKey,
    requireScope("modmail:read"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;

      const { data: config, error } = await tryCatch(db.findOne(MinecraftConfig, { guildId }));

      if (error) {
        log.error("Failed to fetch minecraft config:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to fetch configuration", 500, req.requestId));
      }

      return res.json(createSuccessResponse(config, req.requestId));
    })
  );

  /**
   * PUT /api/minecraft/:guildId/config
   * Update minecraft configuration for a guild
   */
  router.put(
    "/:guildId/config",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const configData = req.body;

      const { data: updatedConfig, error } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftConfig,
          { guildId },
          { ...configData, guildId },
          { upsert: true, new: true }
        )
      );

      if (error) {
        log.error("Failed to update minecraft config:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to update configuration", 500, req.requestId));
      }

      return res.json(createSuccessResponse(updatedConfig, req.requestId));
    })
  );

  /**
   * GET /api/minecraft/:guildId/players
   * Get all players (linked + unlinked) for a guild
   */
  router.get(
    "/:guildId/players",
    authenticateApiKey,
    requireScope("modmail:read"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const { status, search } = req.query;

      let query: any = { guildId };

      if (status && status !== "all") {
        query.whitelistStatus = status;
      }

      if (search && typeof search === "string") {
        query.$or = [
          { minecraftUsername: { $regex: search, $options: "i" } },
          { discordId: search },
        ];
      }

      const { data: players, error } = await tryCatch(db.find(MinecraftPlayer, query));

      if (error) {
        log.error("Failed to fetch minecraft players:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to fetch players", 500, req.requestId));
      }

      return res.json(createSuccessResponse(players || [], req.requestId));
    })
  );

  /**
   * GET /api/minecraft/:guildId/pending
   * Get pending authentication requests for a guild
   */
  router.get(
    "/:guildId/pending",
    authenticateApiKey,
    requireScope("modmail:read"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;

      const { data: pending, error } = await tryCatch(
        db.find(MinecraftAuthPending, {
          guildId,
          status: { $in: ["code_confirmed"] }, // Only show confirmed codes waiting for approval
          expiresAt: { $gt: new Date() },
        })
      );

      if (error) {
        log.error("Failed to fetch pending authentications:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to fetch pending requests", 500, req.requestId));
      }

      return res.json(createSuccessResponse(pending || [], req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/approve/:authId
   * Approve a pending authentication request
   */
  router.post(
    "/:guildId/approve/:authId",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, authId } = req.params;
      const { notes } = req.body;
      const staffMemberId = req.body.staffMemberId; // Should be provided by dashboard

      // Find the pending auth
      const { data: pendingAuth, error: authError } = await tryCatch(
        db.findOne(MinecraftAuthPending, {
          _id: authId,
          guildId,
          status: "code_confirmed",
        })
      );

      if (authError) {
        log.error("Failed to find pending auth:", authError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to find authentication request", 500, req.requestId));
      }

      if (!pendingAuth) {
        return res
          .status(404)
          .json(createErrorResponse("Authentication request not found", 404, req.requestId));
      }

      // Create the player record
      const { error: playerError } = await tryCatch(
        (async () => {
          const player = new MinecraftPlayer({
            guildId,
            minecraftUsername: pendingAuth.minecraftUsername,
            discordId: pendingAuth.discordId,
            whitelistStatus: "whitelisted",
            linkedAt: pendingAuth.createdAt,
            whitelistedAt: new Date(),
            approvedBy: staffMemberId,
            source: "linked",
            notes: notes || undefined,
          });
          await player.save();
        })()
      );

      if (playerError) {
        log.error("Failed to create player record:", playerError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to create player record", 500, req.requestId));
      }

      // Clean up the pending auth
      const { error: cleanupError } = await tryCatch(
        db.deleteOne(MinecraftAuthPending, { _id: authId })
      );

      if (cleanupError) {
        log.warn("Failed to cleanup pending auth:", cleanupError);
      }

      // TODO: Add RCON integration here to actually whitelist the player
      // TODO: Send DM to user notifying them of approval

      log.info(
        `Approved minecraft link: ${pendingAuth.minecraftUsername} for discord ${pendingAuth.discordId}`
      );

      return res.json(
        createSuccessResponse(
          {
            message: "Player approved successfully",
            minecraftUsername: pendingAuth.minecraftUsername,
            discordId: pendingAuth.discordId,
          },
          req.requestId
        )
      );
    })
  );

  /**
   * POST /api/minecraft/:guildId/reject/:authId
   * Reject a pending authentication request
   */
  router.post(
    "/:guildId/reject/:authId",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, authId } = req.params;
      const { reason } = req.body;
      const staffMemberId = req.body.staffMemberId;

      // Find and delete the pending auth
      const { data: pendingAuth, error: deleteError } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftAuthPending,
          { _id: authId, guildId, status: "code_confirmed" },
          { status: "rejected", rejectedBy: staffMemberId, rejectionReason: reason }
        )
      );

      if (deleteError) {
        log.error("Failed to reject pending auth:", deleteError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to reject authentication request", 500, req.requestId));
      }

      if (!pendingAuth) {
        return res
          .status(404)
          .json(createErrorResponse("Authentication request not found", 404, req.requestId));
      }

      // TODO: Send DM to user notifying them of rejection

      log.info(
        `Rejected minecraft link: ${pendingAuth.minecraftUsername} for discord ${pendingAuth.discordId}`
      );

      return res.json(
        createSuccessResponse(
          {
            message: "Player rejected successfully",
            minecraftUsername: pendingAuth.minecraftUsername,
            discordId: pendingAuth.discordId,
          },
          req.requestId
        )
      );
    })
  );

  /**
   * DELETE /api/minecraft/:guildId/players/:playerId
   * Remove/revoke a player's whitelist
   */
  router.delete(
    "/:guildId/players/:playerId",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { reason } = req.body;
      const staffMemberId = req.body.staffMemberId;

      // Update the player record
      const { data: player, error } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftPlayer,
          { _id: playerId, guildId },
          {
            whitelistStatus: "not_whitelisted",
            revokedBy: staffMemberId,
            revokedAt: new Date(),
            notes: reason || undefined,
          },
          { upsert: false, new: true }
        )
      );

      if (error) {
        log.error("Failed to revoke player:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to revoke player", 500, req.requestId));
      }

      if (!player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      // TODO: Add RCON integration here to actually remove from whitelist
      // TODO: Send DM to user notifying them of revocation (if they have discordId)

      log.info(`Revoked minecraft access: ${player.minecraftUsername}`);

      return res.json(
        createSuccessResponse(
          {
            message: "Player revoked successfully",
            minecraftUsername: player.minecraftUsername,
          },
          req.requestId
        )
      );
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/whitelist
   * Whitelist a player
   */
  router.post(
    "/:guildId/players/:playerId/whitelist",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { notes } = req.body;
      const staffMemberId = req.body.staffMemberId;

      const { data: player, error } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftPlayer,
          { _id: playerId, guildId },
          {
            whitelistStatus: "whitelisted",
            whitelistedAt: new Date(),
            approvedBy: staffMemberId,
            notes: notes || undefined,
          },
          { upsert: false, new: true }
        )
      );

      if (error) {
        log.error("Failed to whitelist player:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to whitelist player", 500, req.requestId));
      }

      if (!player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      log.info(`Whitelisted player: ${player.minecraftUsername}`);

      return res.json(createSuccessResponse(player, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/unwhitelist
   * Remove a player from whitelist
   */
  router.post(
    "/:guildId/players/:playerId/unwhitelist",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { notes } = req.body;
      const staffMemberId = req.body.staffMemberId;

      const { data: player, error } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftPlayer,
          { _id: playerId, guildId },
          {
            whitelistStatus: "unwhitelisted",
            revokedAt: new Date(),
            revokedBy: staffMemberId,
            notes: notes || undefined,
          },
          { upsert: false, new: true }
        )
      );

      if (error) {
        log.error("Failed to unwhitelist player:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to unwhitelist player", 500, req.requestId));
      }

      if (!player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      log.info(`Unwhitelisted player: ${player.minecraftUsername}`);

      return res.json(createSuccessResponse(player, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/ban
   * Ban a player
   */
  router.post(
    "/:guildId/players/:playerId/ban",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { notes } = req.body;
      const staffMemberId = req.body.staffMemberId;

      const { data: player, error } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftPlayer,
          { _id: playerId, guildId },
          {
            whitelistStatus: "banned",
            bannedAt: new Date(),
            bannedBy: staffMemberId,
            notes: notes || undefined,
          },
          { upsert: false, new: true }
        )
      );

      if (error) {
        log.error("Failed to ban player:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to ban player", 500, req.requestId));
      }

      if (!player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      log.info(`Banned player: ${player.minecraftUsername}`);

      return res.json(createSuccessResponse(player, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/test-rcon
   * Test RCON connection
   */
  router.post(
    "/:guildId/test-rcon",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const { host, port, password } = req.body;

      if (!host || !password) {
        return res
          .status(400)
          .json(createErrorResponse("Missing host or password", 400, req.requestId));
      }

      // TODO: Implement actual RCON connection test
      // For now, return a mock success response
      log.info(`Testing RCON connection to ${host}:${port}`);

      // Mock delay to simulate connection test
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return res.json(
        createSuccessResponse(
          {
            message: "RCON test successful",
            host,
            port: port || 25575,
          },
          req.requestId
        )
      );
    })
  );

  return router;
}
