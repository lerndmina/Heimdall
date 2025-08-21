import { Router } from "express";
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
            MinecraftConfig.findOne({
              serverHost: serverIp,
              enabled: true,
            }).lean()
          );
          if (config) {
            guildId = config.guildId;
          }
        }

        // If no server IP provided or no config found, try to find any pending auth for this username or UUID
        if (!guildId) {
          // First try by username
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

          // If not found by username and UUID is available, try by UUID
          if (!guildId && uuid) {
            const { data: uuidPendingAuth } = await tryCatch(
              MinecraftAuthPending.findOne({
                "lastConnectionAttempt.uuid": uuid,
                status: { $in: ["awaiting_connection", "code_shown"] },
                expiresAt: { $gt: new Date() },
              }).lean()
            );

            if (uuidPendingAuth) {
              guildId = uuidPendingAuth.guildId;
            }
          }
        }

        // If still no guild found, check if we have any player record for this username or UUID
        if (!guildId) {
          // First try by UUID (more reliable)
          if (uuid) {
            const { data: existingPlayer } = await tryCatch(
              MinecraftPlayer.findOne({
                minecraftUuid: uuid,
              }).lean()
            );
            if (existingPlayer) {
              guildId = existingPlayer.guildId;
            }
          }

          // Fallback to username if UUID didn't find anything
          if (!guildId) {
            const { data: existingPlayer } = await tryCatch(
              MinecraftPlayer.findOne({
                minecraftUsername: username,
              }).lean()
            );
            if (existingPlayer) {
              guildId = existingPlayer.guildId;
            }
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
          MinecraftConfig.findOne({ guildId, enabled: true }).lean()
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
          MinecraftAuthPending.updateMany(
            {
              guildId,
              minecraftUsername: username,
              status: { $ne: "expired" },
              expiresAt: { $lte: new Date() },
            },
            { status: "expired" }
          )
        );

        // Check if player should be whitelisted (check by UUID first, then username)
        let player: any = null;
        let playerError: Error | null = null;

        // First, try to find player by UUID (most reliable)
        if (uuid) {
          const uuidResult = await tryCatch(
            MinecraftPlayer.findOne({
              guildId,
              minecraftUuid: uuid,
            }).lean()
          );
          player = uuidResult.data;
          playerError = uuidResult.error;

          // If found by UUID but username is different, update the username
          if (player && player.minecraftUsername !== username) {
            log.info(
              `Player UUID ${uuid} found with different username. Updating from '${player.minecraftUsername}' to '${username}'`
            );

            const { error: updateError } = await tryCatch(
              MinecraftPlayer.findOneAndUpdate(
                { _id: player._id },
                {
                  minecraftUsername: username,
                  lastConnectionAttempt: new Date(),
                },
                { upsert: false, new: true }
              )
            );

            if (updateError) {
              log.warn("Failed to update username for UUID:", updateError);
            } else {
              log.info(
                `Successfully updated username for UUID ${uuid} from '${player.minecraftUsername}' to '${username}'`
              );
              // Update the player object with new username
              player.minecraftUsername = username;
            }
          }
        }

        // If not found by UUID, try to find by username (fallback for legacy players)
        if (!player && !playerError) {
          const usernameResult = await tryCatch(
            MinecraftPlayer.findOne({
              guildId,
              minecraftUsername: username,
            }).lean()
          );
          player = usernameResult.data;
          playerError = usernameResult.error;

          // If found by username but UUID is missing/different, update the UUID
          if (player && uuid && (!player.minecraftUuid || player.minecraftUuid !== uuid)) {
            log.info(
              `Player ${username} found but UUID is missing or different. Updating UUID to ${uuid}`
            );

            const { error: updateError } = await tryCatch(
              MinecraftPlayer.findOneAndUpdate(
                { _id: player._id },
                {
                  minecraftUuid: uuid,
                  lastConnectionAttempt: new Date(),
                },
                { upsert: false, new: true }
              )
            );

            if (updateError) {
              log.warn("Failed to update UUID for player:", updateError);
            } else {
              log.info(`Successfully updated UUID for player ${username} to ${uuid}`);
              // Update the player object with new UUID
              player.minecraftUuid = uuid;
            }
          }
        }

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
            MinecraftPlayer.findOneAndUpdate(
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

        // Player doesn't exist or is unwhitelisted - check for pending auth
        // Try to find by username first, then by UUID from previous connection attempts
        let pendingAuth: any = null;
        let authError: Error | null = null;

        const pendingAuthResult = await tryCatch(
          MinecraftAuthPending.findOne({
            guildId,
            minecraftUsername: username,
            status: { $in: ["awaiting_connection", "code_shown", "code_confirmed"] },
            expiresAt: { $gt: new Date() },
          }).lean()
        );

        pendingAuth = pendingAuthResult.data;
        authError = pendingAuthResult.error;

        // If not found by username but UUID is available, try to find by UUID in connection attempts
        if (!pendingAuth && !authError && uuid) {
          const uuidAuthResult = await tryCatch(
            MinecraftAuthPending.findOne({
              guildId,
              "lastConnectionAttempt.uuid": uuid,
              status: { $in: ["awaiting_connection", "code_shown", "code_confirmed"] },
              expiresAt: { $gt: new Date() },
            }).lean()
          );

          if (uuidAuthResult.data && !uuidAuthResult.error) {
            pendingAuth = uuidAuthResult.data;
            authError = uuidAuthResult.error;

            // If found by UUID but username is different, update the username
            if (pendingAuth && pendingAuth.minecraftUsername !== username) {
              log.info(
                `Pending auth found by UUID ${uuid} with different username. Updating from '${pendingAuth.minecraftUsername}' to '${username}'`
              );

              const { error: updateError } = await tryCatch(
                MinecraftAuthPending.findOneAndUpdate(
                  { _id: pendingAuth._id },
                  { minecraftUsername: username },
                  { upsert: false, new: true }
                )
              );

              if (updateError) {
                log.warn("Failed to update pending auth username:", updateError);
              } else {
                pendingAuth.minecraftUsername = username;
              }
            }
          }
        }

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
            MinecraftAuthPending.findOneAndUpdate(
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
            .replace(/{code}/g, pendingAuth.authCode)
            .replace(/{username}/g, username)
            .replace(/{serverHost}/g, config.serverHost)
            .replace(/{serverPort}/g, config.serverPort.toString());

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
          .replace(/{username}/g, username)
          .replace(/{serverHost}/g, config.serverHost)
          .replace(/{serverPort}/g, config.serverPort.toString());

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

      const { data: config, error } = await tryCatch(MinecraftConfig.findOne({ guildId }).lean());

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
        MinecraftConfig.findOneAndUpdate(
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

      const { data: players, error } = await tryCatch(MinecraftPlayer.find(query).lean());

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
        MinecraftAuthPending.find({
          guildId,
          status: { $in: ["code_confirmed"] }, // Only show confirmed codes waiting for approval
          // No expiration check - once confirmed, expiration is irrelevant
        }).lean()
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

      // Find the pending auth - force database lookup to avoid stale cache
      const { data: pendingAuth, error: authError } = await tryCatch(
        MinecraftAuthPending.findOne({
          _id: authId,
          guildId,
        }).lean()
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

      // Check if the status allows approval
      if (pendingAuth.status !== "code_confirmed") {
        log.warn(`Auth request ${authId} has status ${pendingAuth.status}, cannot approve`);
        return res
          .status(400)
          .json(
            createErrorResponse(
              `Authentication request cannot be approved (current status: ${pendingAuth.status})`,
              400,
              req.requestId
            )
          );
      }

      // Check if a player with this username already exists
      const { data: existingPlayer, error: findError } = await tryCatch(
        MinecraftPlayer.findOne({
          guildId,
          minecraftUsername: pendingAuth.minecraftUsername,
        })
      );

      if (findError) {
        log.error("Failed to check for existing player:", findError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to check player records", 500, req.requestId));
      }

      let playerError: Error | null = null;

      if (existingPlayer) {
        // Update existing player record
        log.info(`Updating existing player record for ${pendingAuth.minecraftUsername}`);

        // Prepare update data
        const updateData: any = {
          discordId: pendingAuth.discordId,
          whitelistStatus: "whitelisted",
          linkedAt: pendingAuth.createdAt,
          whitelistedAt: new Date(),
          approvedBy: staffMemberId,
          source: "linked",
          notes: notes || existingPlayer.notes,
          updatedAt: new Date(),
        };

        // Add UUID if available from the last connection attempt
        if (pendingAuth.lastConnectionAttempt?.uuid) {
          updateData.minecraftUuid = pendingAuth.lastConnectionAttempt.uuid;
          log.info(
            `Also updating UUID for ${pendingAuth.minecraftUsername} to ${pendingAuth.lastConnectionAttempt.uuid}`
          );
        }

        const { error } = await tryCatch(
          MinecraftPlayer.findOneAndUpdate({ _id: existingPlayer._id }, updateData, { new: true })
        );
        playerError = error;
      } else {
        // Create new player record
        log.info(`Creating new player record for ${pendingAuth.minecraftUsername}`);
        const { error } = await tryCatch(
          (async () => {
            const playerData: any = {
              guildId,
              minecraftUsername: pendingAuth.minecraftUsername,
              discordId: pendingAuth.discordId,
              whitelistStatus: "whitelisted",
              linkedAt: pendingAuth.createdAt,
              whitelistedAt: new Date(),
              approvedBy: staffMemberId,
              source: "linked",
              notes: notes || undefined,
            };

            // Add UUID if available from the last connection attempt
            if (pendingAuth.lastConnectionAttempt?.uuid) {
              playerData.minecraftUuid = pendingAuth.lastConnectionAttempt.uuid;
            }

            const player = new MinecraftPlayer(playerData);
            await player.save();
          })()
        );
        playerError = error;
      }

      if (playerError) {
        log.error("Failed to create/update player record:", playerError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to create/update player record", 500, req.requestId));
      }

      // Clean up the pending auth
      const { error: cleanupError } = await tryCatch(
        MinecraftAuthPending.deleteOne({ _id: authId })
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

      log.debug(`Attempting to reject auth: ${authId} for guild: ${guildId}`);

      // First, check if the record exists and get its current status
      const { data: existingAuth, error: findError } = await tryCatch(
        MinecraftAuthPending.findOne({ _id: authId, guildId }).lean()
      );

      if (findError) {
        log.error("Error finding pending auth:", findError);
        return res
          .status(500)
          .json(
            createErrorResponse(
              "Database error while finding authentication request",
              500,
              req.requestId
            )
          );
      }

      if (!existingAuth) {
        log.warn(`Auth request not found: ${authId} in guild: ${guildId}`);
        return res
          .status(404)
          .json(createErrorResponse("Authentication request not found", 404, req.requestId));
      }

      log.debug(`Found auth with current status: ${existingAuth.status}`);

      if (existingAuth.status !== "code_confirmed") {
        log.warn(`Auth request ${authId} has status ${existingAuth.status}, cannot reject`);
        return res
          .status(400)
          .json(
            createErrorResponse(
              `Authentication request cannot be rejected (current status: ${existingAuth.status})`,
              400,
              req.requestId
            )
          );
      }

      // Update the status to rejected
      const { data: pendingAuth, error: updateError } = await tryCatch(
        MinecraftAuthPending.findOneAndUpdate(
          { _id: authId, guildId, status: "code_confirmed" },
          { status: "rejected", rejectedBy: staffMemberId, rejectionReason: reason },
          { new: true, upsert: false } // Return the updated document
        )
      );

      if (updateError) {
        log.error("Failed to reject pending auth:", updateError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to reject authentication request", 500, req.requestId));
      }

      if (!pendingAuth) {
        log.error(`Update operation returned null for auth ${authId}`);
        return res
          .status(404)
          .json(
            createErrorResponse(
              "Authentication request not found or already processed",
              404,
              req.requestId
            )
          );
      }

      log.debug(`Successfully updated auth ${authId} to status: ${pendingAuth.status}`);

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
        MinecraftPlayer.findOneAndUpdate(
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
        MinecraftPlayer.findOneAndUpdate(
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
        MinecraftPlayer.findOneAndUpdate(
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

  /**
   * POST /api/minecraft/:guildId/bulk-approve
   * Approve the oldest X whitelist requests (queue processing)
   */
  router.post(
    "/:guildId/bulk-approve",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const { count = 10, staffMemberId } = req.body;

      if (!staffMemberId) {
        return res
          .status(400)
          .json(createErrorResponse("staffMemberId is required", 400, req.requestId));
      }

      if (typeof count !== "number" || count < 1 || count > 50) {
        return res
          .status(400)
          .json(createErrorResponse("count must be a number between 1 and 50", 400, req.requestId));
      }

      log.info(
        `[Minecraft Bulk Approve] Processing bulk approval for guild ${guildId}, approving oldest ${count} requests`
      );

      // Find the oldest pending approval requests
      const { data: pendingPlayers, error: findError } = await tryCatch(
        MinecraftPlayer.find({
          guildId,
          whitelistStatus: "pending_approval",
        })
          .sort({ createdAt: 1 }) // Oldest first
          .limit(count)
          .lean()
      );

      if (findError) {
        log.error("[Minecraft Bulk Approve] Failed to find pending players:", findError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to find pending players", 500, req.requestId));
      }

      if (!pendingPlayers || pendingPlayers.length === 0) {
        return res.json(
          createSuccessResponse(
            {
              message: "No pending approval requests found",
              approved: 0,
              errors: [],
            },
            req.requestId
          )
        );
      }

      let approvedCount = 0;
      const errors: string[] = [];
      const approvedPlayers: string[] = []; // Track approved usernames

      // Process each player approval
      for (const player of pendingPlayers) {
        try {
          const { error: updateError } = await tryCatch(
            MinecraftPlayer.findOneAndUpdate(
              { _id: player._id },
              {
                whitelistStatus: "whitelisted",
                isWhitelisted: true,
                approvedBy: staffMemberId,
                whitelistedAt: new Date(),
                updatedAt: new Date(),
              },
              { new: false }
            )
          );

          if (updateError) {
            errors.push(`Failed to approve ${player.minecraftUsername}: ${updateError.message}`);
          } else {
            approvedCount++;
            approvedPlayers.push(player.minecraftUsername); // Add to approved list
            log.info(
              `[Minecraft Bulk Approve] Approved ${player.minecraftUsername} (${player._id}) by staff ${staffMemberId}`
            );
          }
        } catch (error) {
          errors.push(
            `Error approving ${player.minecraftUsername}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      const summary = {
        message: `Bulk approval completed`,
        totalRequested: count,
        totalFound: pendingPlayers.length,
        approved: approvedCount,
        approvedPlayers, // Include list of approved usernames
        errors: errors.length,
        errorDetails: errors,
      };

      log.info(`[Minecraft Bulk Approve] Completed for guild ${guildId}:`, summary);

      return res.json(createSuccessResponse(summary, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/import-whitelist
   * Import players from a Minecraft whitelist JSON file
   */
  router.post(
    "/:guildId/import-whitelist",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const whitelistData = req.body;

      if (!Array.isArray(whitelistData)) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "Invalid whitelist format. Expected array of player objects.",
              400,
              req.requestId
            )
          );
      }

      log.info(
        `[Minecraft Import] Starting optimized whitelist import for guild ${guildId}, ${whitelistData.length} players`
      );

      // Validate and prepare data in batch
      const validPlayers: Array<{
        username: string;
        uuid: string;
        originalEntry: any;
      }> = [];
      const errors: string[] = [];

      // First pass: validate all entries
      for (const playerEntry of whitelistData) {
        if (!playerEntry.name || !playerEntry.uuid) {
          errors.push(
            `Invalid player entry: missing name or uuid - ${JSON.stringify(playerEntry)}`
          );
          continue;
        }
        validPlayers.push({
          username: playerEntry.name.toLowerCase(),
          uuid: playerEntry.uuid,
          originalEntry: playerEntry,
        });
      }

      if (validPlayers.length === 0) {
        return res.json(
          createSuccessResponse(
            {
              totalProcessed: whitelistData.length,
              imported: 0,
              updated: 0,
              errors: errors.length,
              errorDetails: errors,
            },
            req.requestId
          )
        );
      }

      // Extract usernames and UUIDs for bulk query
      const usernames = validPlayers.map((p) => p.username);
      const uuids = validPlayers.map((p) => p.uuid);

      // Bulk find existing players
      const { data: existingPlayers, error: findError } = await tryCatch(
        MinecraftPlayer.find({
          guildId,
          $or: [{ minecraftUsername: { $in: usernames } }, { minecraftUuid: { $in: uuids } }],
        }).lean()
      );

      if (findError) {
        log.error("[Minecraft Import] Failed to query existing players:", findError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to query existing players", 500, req.requestId));
      }

      // Create lookup maps for efficient checking
      const existingByUsername = new Map<string, any>();
      const existingByUuid = new Map<string, any>();

      (existingPlayers || []).forEach((player) => {
        if (player.minecraftUsername) {
          existingByUsername.set(player.minecraftUsername, player);
        }
        if (player.minecraftUuid) {
          existingByUuid.set(player.minecraftUuid, player);
        }
      });

      // Prepare bulk operations
      const playersToUpdate: Array<{
        filter: any;
        update: any;
      }> = [];

      const playersToCreate: Array<any> = [];

      // Process each valid player
      for (const { username, uuid } of validPlayers) {
        const existingPlayer = existingByUsername.get(username) || existingByUuid.get(uuid);

        if (existingPlayer) {
          // Prepare update operation
          playersToUpdate.push({
            filter: { _id: existingPlayer._id },
            update: {
              isWhitelisted: true,
              whitelistStatus: "whitelisted",
              minecraftUsername: username,
              minecraftUuid: uuid,
              updatedAt: new Date(),
            },
          });
        } else {
          // Prepare create operation
          playersToCreate.push({
            guildId,
            minecraftUsername: username,
            minecraftUuid: uuid,
            isWhitelisted: true,
            whitelistStatus: "whitelisted",
            source: "imported",
            whitelistedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      let updatedCount = 0;
      let importedCount = 0;

      // Perform bulk updates
      if (playersToUpdate.length > 0) {
        try {
          const bulkUpdateOps = playersToUpdate.map(({ filter, update }) => ({
            updateOne: {
              filter,
              update,
            },
          }));

          const { data: updateResult, error: updateError } = await tryCatch(
            MinecraftPlayer.bulkWrite(bulkUpdateOps)
          );

          if (updateError) {
            log.error("[Minecraft Import] Bulk update failed:", updateError);
            errors.push(`Bulk update failed: ${updateError.message}`);
          } else {
            updatedCount = updateResult?.modifiedCount || 0;
            log.info(`[Minecraft Import] Bulk updated ${updatedCount} players`);
          }
        } catch (error) {
          errors.push(
            `Bulk update error: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      // Perform bulk inserts
      if (playersToCreate.length > 0) {
        try {
          const { data: insertResult, error: insertError } = await tryCatch(
            MinecraftPlayer.insertMany(playersToCreate, { ordered: false })
          );

          if (insertError) {
            log.error("[Minecraft Import] Bulk insert failed:", insertError);
            errors.push(`Bulk insert failed: ${insertError.message}`);
          } else {
            importedCount = Array.isArray(insertResult) ? insertResult.length : 0;
            log.info(`[Minecraft Import] Bulk inserted ${importedCount} players`);
          }
        } catch (error) {
          errors.push(
            `Bulk insert error: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }

      const summary = {
        totalProcessed: whitelistData.length,
        validated: validPlayers.length,
        imported: importedCount,
        updated: updatedCount,
        errors: errors.length,
        errorDetails: errors,
        performance: {
          bulkUpdates: playersToUpdate.length,
          bulkInserts: playersToCreate.length,
          optimized: true,
        },
      };

      log.info(`[Minecraft Import] Optimized import completed for guild ${guildId}:`, summary);

      return res.json(createSuccessResponse(summary, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/link
   * Manually link a Discord account to a Minecraft player
   */
  router.post(
    "/:guildId/players/:playerId/link",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { discordId } = req.body;

      if (!discordId) {
        return res
          .status(400)
          .json(createErrorResponse("Discord ID is required", 400, req.requestId));
      }

      // Validate Discord ID format (should be a snowflake)
      if (!/^\d{17,19}$/.test(discordId)) {
        return res
          .status(400)
          .json(createErrorResponse("Invalid Discord ID format", 400, req.requestId));
      }

      // Find the player and verify guild ownership
      const { data: player, error: findError } = await tryCatch(
        MinecraftPlayer.findOne({ _id: playerId, guildId }).lean()
      );

      if (findError || !player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      // Check if Discord user is already linked to another player in this guild
      const { data: existingLink } = await tryCatch(
        MinecraftPlayer.findOne({
          guildId,
          discordUserId: discordId,
          _id: { $ne: playerId },
        })
      );

      if (existingLink) {
        return res
          .status(409)
          .json(
            createErrorResponse(
              `Discord user is already linked to player: ${existingLink.minecraftUsername}`,
              409,
              req.requestId
            )
          );
      }

      // Update the player with Discord link
      const { data: updatedPlayer, error: updateError } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate(
          { _id: playerId, guildId },
          {
            discordUserId: discordId,
            isLinked: true,
            discordId: discordId,
            updatedAt: new Date(),
          },
          { upsert: false, new: true }
        )
      );

      if (updateError) {
        log.error(
          `[Minecraft Link] Failed to link Discord user ${discordId} to player ${playerId}:`,
          updateError
        );
        return res
          .status(500)
          .json(createErrorResponse("Failed to link Discord account", 500, req.requestId));
      }

      log.info(
        `[Minecraft Link] Successfully linked Discord user ${discordId} to player ${player.minecraftUsername} in guild ${guildId}`
      );

      return res.json(
        createSuccessResponse(
          {
            message: "Discord account linked successfully",
            player: updatedPlayer,
          },
          req.requestId
        )
      );
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/manual
   * Manually create a player record with username, UUID, and Discord ID
   */
  router.post(
    "/:guildId/players/manual",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const { minecraftUsername, minecraftUuid, discordId, notes, staffMemberId } = req.body;

      // Validation
      if (!minecraftUsername || !discordId || !staffMemberId) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              "minecraftUsername, discordId, and staffMemberId are required",
              400,
              req.requestId
            )
          );
      }

      // Validate UUID format if provided
      if (
        minecraftUuid &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(minecraftUuid)
      ) {
        return res.status(400).json(createErrorResponse("Invalid UUID format", 400, req.requestId));
      }

      log.info(
        `[Minecraft Manual Create] Creating player record for ${minecraftUsername} by staff ${staffMemberId}`
      );

      // Check if player already exists by username
      const { data: existingByUsername, error: usernameError } = await tryCatch(
        MinecraftPlayer.findOne({
          guildId,
          minecraftUsername: minecraftUsername,
        }).lean()
      );

      if (usernameError) {
        log.error("Failed to check for existing username:", usernameError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to check for existing records", 500, req.requestId));
      }

      if (existingByUsername) {
        return res
          .status(409)
          .json(
            createErrorResponse(
              `Player with username '${minecraftUsername}' already exists`,
              409,
              req.requestId
            )
          );
      }

      // Check if UUID already exists (if provided)
      if (minecraftUuid) {
        const { data: existingByUuid, error: uuidError } = await tryCatch(
          MinecraftPlayer.findOne({
            guildId,
            minecraftUuid: minecraftUuid,
          }).lean()
        );

        if (uuidError) {
          log.error("Failed to check for existing UUID:", uuidError);
          return res
            .status(500)
            .json(createErrorResponse("Failed to check for existing records", 500, req.requestId));
        }

        if (existingByUuid) {
          return res
            .status(409)
            .json(
              createErrorResponse(
                `Player with UUID '${minecraftUuid}' already exists`,
                409,
                req.requestId
              )
            );
        }
      }

      // Check if Discord ID already exists
      const { data: existingByDiscord, error: discordError } = await tryCatch(
        MinecraftPlayer.findOne({
          guildId,
          discordId: discordId,
        }).lean()
      );

      if (discordError) {
        log.error("Failed to check for existing Discord ID:", discordError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to check for existing records", 500, req.requestId));
      }

      if (existingByDiscord) {
        return res
          .status(409)
          .json(
            createErrorResponse(
              `Discord user is already linked to player: ${existingByDiscord.minecraftUsername}`,
              409,
              req.requestId
            )
          );
      }

      // Create the player record
      const { data: newPlayer, error: createError } = await tryCatch(
        (async () => {
          const playerData: any = {
            guildId,
            minecraftUsername,
            discordId,
            whitelistStatus: "whitelisted",
            isWhitelisted: true,
            linkedAt: new Date(),
            whitelistedAt: new Date(),
            approvedBy: staffMemberId,
            source: "manual",
            notes: notes || "Manually created via dashboard",
          };

          // Add UUID if provided
          if (minecraftUuid) {
            playerData.minecraftUuid = minecraftUuid;
          }

          const player = new MinecraftPlayer(playerData);
          return await player.save();
        })()
      );

      if (createError) {
        log.error("Failed to create player record:", createError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to create player record", 500, req.requestId));
      }

      log.info(
        `[Minecraft Manual Create] Successfully created player ${minecraftUsername} for Discord ${discordId}`
      );

      return res.json(
        createSuccessResponse(
          {
            message: "Player created successfully",
            player: newPlayer,
          },
          req.requestId
        )
      );
    })
  );

  return router;
}
