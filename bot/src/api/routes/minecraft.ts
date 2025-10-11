import { Router } from "express";
import MinecraftConfig from "../../models/MinecraftConfig";
import MinecraftPlayer from "../../models/MinecraftPlayer";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import { createSuccessResponse, createErrorResponse } from "../utils/apiResponse";
import { authenticateApiKey, requireScope } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import RoleSyncService from "../../services/RoleSyncService";

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
          currentGroups = [],
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
          // First try by username for players with active auth
          const { data: pendingAuth } = await tryCatch(
            MinecraftPlayer.findOne({
              minecraftUsername: username,
              authCode: { $ne: null },
              expiresAt: { $gt: new Date() },
              confirmedAt: null,
            }).lean()
          );

          if (pendingAuth) {
            guildId = pendingAuth.guildId;
          }

          // If not found by username and UUID is available, try by UUID from connection attempts
          if (!guildId && uuid) {
            const { data: uuidPendingAuth } = await tryCatch(
              MinecraftPlayer.findOne({
                minecraftUuid: uuid,
                authCode: { $ne: null },
                expiresAt: { $gt: new Date() },
                confirmedAt: null,
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

        // Clean up any expired auth records for this username
        await tryCatch(
          MinecraftPlayer.updateMany(
            {
              guildId,
              minecraftUsername: username,
              authCode: { $ne: null },
              expiresAt: { $lte: new Date() },
            },
            {
              $unset: {
                authCode: 1,
                expiresAt: 1,
                codeShownAt: 1,
              },
            }
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
          if (player && player.minecraftUsername.toLowerCase() !== username.toLowerCase()) {
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

        // If player exists and is whitelisted (and not revoked), allow them
        if (player && player.whitelistedAt && !player.revokedAt) {
          log.info(`Player ${username} is whitelisted, allowing connection`);

          // Initialize role sync service
          const roleSyncService = new RoleSyncService(res.locals.client);

          // Calculate role sync if enabled
          const roleSyncResult = await roleSyncService.calculateRoleSync(
            guildId!,
            player._id.toString(),
            currentGroups
          );

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

          // Log role sync operation if there were changes
          if (roleSyncResult.operation) {
            await RoleSyncService.logRoleSync(guildId!, roleSyncResult.operation);
            log.info(
              `Role sync calculated for ${username}: target groups [${roleSyncResult.targetGroups.join(
                ", "
              )}]`
            );
          }

          // Prepare response with role sync data
          const response: any = {
            shouldBeWhitelisted: true,
            hasAuth: false,
            action: "allow",
            kickMessage: "", // No kick needed
          };

          // Add role sync data if enabled
          if (roleSyncResult.enabled) {
            response.roleSync = {
              enabled: true,
              targetGroups: roleSyncResult.targetGroups,
              managedGroups: roleSyncResult.managedGroups,
            };
            log.debug(`Role sync response for ${username}:`, {
              enabled: roleSyncResult.enabled,
              targetGroups: roleSyncResult.targetGroups,
              managedGroups: roleSyncResult.managedGroups,
            });
          } else {
            log.debug(`Role sync disabled for ${username}`, {
              reason: "roleSyncResult.enabled = false",
            });
          }

          return res.json(createSuccessResponse(response, req.requestId));
        }

        // Check if player has confirmed their code but is waiting for approval
        // This handles the case where the auth code has expired but confirmedAt is set
        // A player is "waiting for approval" if they have confirmedAt but no whitelistedAt
        if (player && player.confirmedAt && !player.whitelistedAt && !player.revokedAt) {
          log.info(
            `Player ${username} has confirmed code but is awaiting approval (confirmedAt: ${player.confirmedAt}, linkedAt: ${player.linkedAt}, whitelistedAt: ${player.whitelistedAt})`
          );

          const pendingMessage = config.authPendingMessage
            .replace(/{username}/g, username)
            .replace(/{serverHost}/g, config.serverHost)
            .replace(/{serverPort}/g, config.serverPort.toString());

          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: true,
                action: "kick_with_message",
                kickMessage: pendingMessage,
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
          MinecraftPlayer.findOne({
            guildId,
            minecraftUsername: username,
            authCode: { $ne: null },
            expiresAt: { $gt: new Date() },
          }).lean()
        );

        pendingAuth = pendingAuthResult.data;
        authError = pendingAuthResult.error;

        // If not found by username but UUID is available, try to find by UUID
        if (!pendingAuth && !authError && uuid) {
          const uuidAuthResult = await tryCatch(
            MinecraftPlayer.findOne({
              guildId,
              minecraftUuid: uuid,
              authCode: { $ne: null },
              expiresAt: { $gt: new Date() },
            }).lean()
          );

          if (uuidAuthResult.data && !uuidAuthResult.error) {
            pendingAuth = uuidAuthResult.data;
            authError = uuidAuthResult.error;

            // If found by UUID but username is different, update the username
            if (
              pendingAuth &&
              pendingAuth.minecraftUsername.toLowerCase() !== username.toLowerCase()
            ) {
              log.info(
                `Pending auth found by UUID ${uuid} with different username. Updating from '${pendingAuth.minecraftUsername}' to '${username}'`
              );

              const { error: updateError } = await tryCatch(
                MinecraftPlayer.findOneAndUpdate(
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
          if (pendingAuth.confirmedAt && !pendingAuth.linkedAt) {
            const pendingMessage = config.authPendingMessage
              .replace(/{username}/g, username)
              .replace(/{serverHost}/g, config.serverHost)
              .replace(/{serverPort}/g, config.serverPort.toString());

            return res.json(
              createSuccessResponse(
                {
                  shouldBeWhitelisted: false,
                  hasAuth: true,
                  action: "kick_with_message",
                  kickMessage: pendingMessage,
                },
                req.requestId
              )
            );
          }

          // Update the pending auth to mark that we showed them the code
          const { error: updateError } = await tryCatch(
            MinecraftPlayer.findOneAndUpdate(
              { _id: pendingAuth._id },
              {
                codeShownAt: new Date(),
                lastConnectionAttempt: new Date(),
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

        // No pending auth and not whitelisted - check if explicitly rejected/revoked or unknown

        // Check if player exists and has been revoked or rejected
        if (player && (player.revokedAt || player.rejectionReason)) {
          // Player exists but was revoked/rejected
          const reason = player.revocationReason || player.rejectionReason || "Access revoked";

          // Use custom leave message if player was revoked for leaving Discord
          let rejectionMessage;
          if (
            player.revokedAt &&
            player.revocationReason &&
            player.revocationReason.toLowerCase().includes("left discord") &&
            config.leaveRevocation?.enabled &&
            config.leaveRevocation?.customMessage
          ) {
            // Use custom leave revocation message
            rejectionMessage = config.leaveRevocation.customMessage
              .replace(/{username}/g, username)
              .replace(/{reason}/g, reason)
              .replace(/{serverHost}/g, config.serverHost)
              .replace(/{serverPort}/g, config.serverPort.toString());
          } else {
            // Use standard application rejection message
            rejectionMessage = config.applicationRejectionMessage
              .replace(/{username}/g, username)
              .replace(/{reason}/g, reason)
              .replace(/{serverHost}/g, config.serverHost)
              .replace(/{serverPort}/g, config.serverPort.toString());
          }

          return res.json(
            createSuccessResponse(
              {
                shouldBeWhitelisted: false,
                hasAuth: false,
                action: "kick_with_message",
                kickMessage: rejectionMessage,
              },
              req.requestId
            )
          );
        }

        // Player doesn't exist or exists but no rejection reason - tell them to start linking process
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
   * POST /api/minecraft/request-link-code
   * Called by the Minecraft plugin when a player uses /linkdiscord command
   * Generates an auth code for existing whitelisted players to link their Discord accounts
   */
  router.post(
    "/request-link-code",
    authenticateApiKey,
    requireScope("minecraft:connection"),
    asyncHandler(async (req, res) => {
      const { username: rawUsername, uuid } = req.body;
      const username = rawUsername?.toLowerCase(); // Normalize to lowercase

      if (!username || !uuid) {
        return res
          .status(400)
          .json(createErrorResponse("Missing username or uuid", 400, req.requestId));
      }

      log.info(`Link code request: ${username} (${uuid})`);

      // Find existing player without Discord link
      const { data: player, error: playerError } = await tryCatch(
        MinecraftPlayer.findOne({
          minecraftUsername: username,
          discordId: null,
          whitelistedAt: { $ne: null },
        }).lean()
      );

      if (playerError) {
        log.error("Failed to check existing player:", playerError);
        return res.status(500).json(createErrorResponse("Database error", 500, req.requestId));
      }

      if (!player) {
        return res.json(
          createSuccessResponse(
            {
              success: false,
              error: "No linkable account found for this username",
            },
            req.requestId
          )
        );
      }

      // Clean up any existing auth code for this username
      await tryCatch(
        MinecraftPlayer.updateOne(
          {
            guildId: player.guildId,
            minecraftUsername: username,
          },
          {
            $unset: {
              authCode: 1,
              expiresAt: 1,
              codeShownAt: 1,
              confirmedAt: 1,
            },
          }
        )
      );

      // Generate unique 6-digit auth code
      let authCode = "";
      let codeIsUnique = false;
      let attempts = 0;

      while (!codeIsUnique && attempts < 10) {
        authCode = Math.floor(100000 + Math.random() * 900000).toString();
        const { data: existingCode } = await tryCatch(MinecraftPlayer.findOne({ authCode }).lean());
        if (!existingCode) {
          codeIsUnique = true;
        }
        attempts++;
      }

      if (!codeIsUnique) {
        log.error("Failed to generate unique auth code after 10 attempts");
        return res
          .status(500)
          .json(createErrorResponse("Failed to generate auth code", 500, req.requestId));
      }

      // Update player with auth code
      const { error: createError } = await tryCatch(
        MinecraftPlayer.updateOne(
          { _id: player._id },
          {
            authCode: authCode,
            codeShownAt: new Date(),
            isExistingPlayerLink: true,
            minecraftUuid: uuid, // Store the UUID for linking
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            lastConnectionAttempt: new Date(),
          }
        )
      );

      if (createError) {
        log.error("Failed to create pending auth:", createError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to create auth record", 500, req.requestId));
      }

      log.info(`Generated link code for existing player: ${username} - ${authCode}`);

      return res.json(
        createSuccessResponse(
          {
            success: true,
            authCode: authCode,
          },
          req.requestId
        )
      );
    })
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

      // If no config exists, return null
      if (!config) {
        return res.json(createSuccessResponse(null, req.requestId));
      }

      // Ensure all required fields exist with defaults for backward compatibility
      const completeConfig = {
        ...config,
        roleSync: config.roleSync || {
          enabled: false,
          enableCaching: true,
          roleMappings: [],
        },
        leaveRevocation: config.leaveRevocation || {
          enabled: false,
          customMessage:
            "❌ Your whitelist has been revoked because you left the Discord server. Please rejoin Discord and contact staff to restore access.",
        },
        // Ensure other potentially missing fields have defaults
        authSuccessMessage:
          config.authSuccessMessage ||
          "✅ Your Minecraft account has been successfully linked! You can now join the server.",
        authRejectionMessage:
          config.authRejectionMessage ||
          "❌ To join this server:\n• Join the Discord server\n• Use /link-minecraft {username}\n• Follow the instructions to link your account",
        authPendingMessage:
          config.authPendingMessage ||
          "⏳ Your account is linked and waiting for staff approval.\nPlease be patient while staff review your request.\nYou will be automatically whitelisted once approved.",
        applicationRejectionMessage:
          config.applicationRejectionMessage ||
          "❌ Your whitelist application has been rejected. Please contact staff for more information.",
      };

      return res.json(createSuccessResponse(completeConfig, req.requestId));
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
        // Convert status-based filtering to date-based logic
        switch (status) {
          case "whitelisted":
            query.whitelistedAt = { $ne: null };
            query.revokedAt = null; // Ensure not revoked
            break;
          case "revoked":
            query.revokedAt = { $ne: null };
            break;
          case "pending":
            query.whitelistedAt = null;
            query.revokedAt = null;
            break;
          case "linked":
            query.linkedAt = { $ne: null };
            break;
          case "unlinked":
            query.linkedAt = null;
            query.confirmedAt = null;
            break;
          default:
            // If unknown status, ignore filter
            break;
        }
      }

      if (search && typeof search === "string") {
        query.$or = [
          { minecraftUsername: { $regex: search, $options: "i" } },
          { discordId: search },
        ];
      }

      const { data: players, error } = await tryCatch(
        MinecraftPlayer.find(query).transform((docs) =>
          docs.map((doc) => doc.toObject({ virtuals: true }))
        )
      );

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
        MinecraftPlayer.find({
          guildId,
          confirmedAt: { $ne: null }, // Code has been confirmed
          linkedAt: null, // But not yet approved by staff
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
        MinecraftPlayer.findOne({
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
      if (!pendingAuth.confirmedAt) {
        log.warn(`Auth request ${authId} not confirmed yet, cannot approve`);
        return res
          .status(400)
          .json(
            createErrorResponse(
              `Authentication request cannot be approved (not confirmed yet)`,
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

      // Since we're using unified model, we're updating the same record
      // The pendingAuth IS the player record now
      log.info(`Approving player record for ${pendingAuth.minecraftUsername}`);

      // Prepare update data
      const updateData: any = {
        linkedAt: new Date(),
        whitelistedAt: new Date(),
        approvedBy: staffMemberId,
        notes: notes || pendingAuth.notes,
        updatedAt: new Date(),
        // Clear auth fields since process is complete
        $unset: {
          authCode: 1,
          expiresAt: 1,
          codeShownAt: 1,
        },
      };

      const { error: playerError } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate({ _id: pendingAuth._id }, updateData, { new: true })
      );

      if (playerError) {
        log.error("Failed to approve player record:", playerError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to approve player record", 500, req.requestId));
      }

      // NOTE: No need to cleanup pending auth since we're updating the same record

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
        MinecraftPlayer.findOne({ _id: authId, guildId }).lean()
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

      log.debug(`Found auth confirmed: ${!!existingAuth.confirmedAt}`);

      if (!existingAuth.confirmedAt) {
        log.warn(`Auth request ${authId} is not confirmed, cannot reject`);
        return res
          .status(400)
          .json(
            createErrorResponse(
              `Authentication request cannot be rejected (not confirmed yet)`,
              400,
              req.requestId
            )
          );
      }

      // Update the status to rejected (clear auth fields and set rejection reason)
      const { data: pendingAuth, error: updateError } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate(
          { _id: authId, guildId, confirmedAt: { $ne: null } },
          {
            rejectionReason: reason,
            revokedBy: staffMemberId,
            revokedAt: new Date(),
            $unset: {
              authCode: 1,
              expiresAt: 1,
              codeShownAt: 1,
              confirmedAt: 1,
            },
          },
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

      log.debug(`Successfully rejected auth ${authId} with reason: ${reason}`);

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
            whitelistedAt: null, // Unwhitelist by removing the date
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
            whitelistedAt: new Date(), // Set whitelist date
            approvedBy: staffMemberId,
            notes: notes || undefined,
            // Clear revocation/rejection fields when re-whitelisting
            $unset: {
              revokedAt: "",
              revokedBy: "",
              revocationReason: "",
              rejectionReason: "",
            },
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
      const { notes, revocationReason } = req.body;
      const staffMemberId = req.body.staffMemberId;

      const { data: player, error } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate(
          { _id: playerId, guildId },
          {
            whitelistedAt: null, // Remove whitelist date
            revokedAt: new Date(),
            revokedBy: staffMemberId,
            revocationReason: revocationReason || "Removed via dashboard",
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

      log.info(
        `Unwhitelisted player: ${player.minecraftUsername} (Reason: ${
          revocationReason || "Not specified"
        })`
      );

      return res.json(createSuccessResponse(player, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/reject
   * Reject a player's application with a custom reason
   */
  router.post(
    "/:guildId/players/:playerId/reject",
    authenticateApiKey,
    requireScope("modmail:write"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { rejectionReason, notes } = req.body;
      const staffMemberId = req.body.staffMemberId;

      if (
        !rejectionReason ||
        typeof rejectionReason !== "string" ||
        rejectionReason.trim().length === 0
      ) {
        return res
          .status(400)
          .json(createErrorResponse("Rejection reason is required", 400, req.requestId));
      }

      const { data: player, error } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate(
          { _id: playerId, guildId },
          {
            rejectionReason: rejectionReason.trim(),
            whitelistedAt: null, // Ensure not whitelisted
            revokedAt: new Date(), // Mark as rejected
            revokedBy: staffMemberId,
            notes: notes || undefined,
          },
          { upsert: false, new: true }
        )
      );

      if (error) {
        log.error("Failed to reject player:", error);
        return res
          .status(500)
          .json(createErrorResponse("Failed to reject player", 500, req.requestId));
      }

      if (!player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      log.info(`Rejected player: ${player.minecraftUsername} (Reason: ${rejectionReason})`);

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

      // Find the oldest pending approval requests from MinecraftPlayer collection
      const { data: pendingAuths, error: findError } = await tryCatch(
        MinecraftPlayer.find({
          guildId,
          confirmedAt: { $ne: null }, // Code has been confirmed
          linkedAt: null, // But not yet approved by staff
        })
          .sort({ confirmedAt: 1, createdAt: 1 }) // Oldest confirmed first
          .limit(count)
          .lean()
      );

      if (findError) {
        log.error("[Minecraft Bulk Approve] Failed to find pending authentications:", findError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to find pending authentications", 500, req.requestId));
      }

      if (!pendingAuths || pendingAuths.length === 0) {
        return res.json(
          createSuccessResponse(
            {
              message: "No pending approval requests found",
              approved: 0,
              approvedPlayers: [],
              errors: [],
            },
            req.requestId
          )
        );
      }

      let approvedCount = 0;
      const errors: string[] = [];
      const approvedPlayers: string[] = []; // Track approved usernames

      // Process each authentication approval (unified model - just update the same record)
      for (const pendingAuth of pendingAuths) {
        try {
          // Since we're using unified model, just update the existing record
          const updateData = {
            linkedAt: new Date(),
            whitelistedAt: new Date(),
            approvedBy: staffMemberId,
            updatedAt: new Date(),
            // Clear auth fields since process is complete
            $unset: {
              authCode: 1,
              expiresAt: 1,
              codeShownAt: 1,
            },
          };

          const { error: playerError } = await tryCatch(
            MinecraftPlayer.findOneAndUpdate({ _id: pendingAuth._id }, updateData, { new: true })
          );

          if (playerError) {
            errors.push(
              `Failed to approve player record for ${pendingAuth.minecraftUsername}: ${playerError.message}`
            );
          } else {
            approvedCount++;
            approvedPlayers.push(pendingAuth.minecraftUsername);
            log.info(
              `[Minecraft Bulk Approve] Approved ${pendingAuth.minecraftUsername} (${pendingAuth._id}) by staff ${staffMemberId}`
            );
          }
        } catch (error) {
          errors.push(
            `Error approving ${pendingAuth.minecraftUsername}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      const summary = {
        message: `Bulk approval completed`,
        totalRequested: count,
        totalFound: pendingAuths.length,
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
   * Import players from a Minecraft whitelist JSON file OR text-based username list
   */
  router.post(
    "/:guildId/import-whitelist",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const requestData = req.body;

      // Handle different input formats
      let whitelistData: any[];
      let isTextImport = false;

      // Check if it's a text-based import (from manual username entry)
      if (requestData.method === "text" && requestData.text) {
        isTextImport = true;
        const staffMemberId = requestData.staffMemberId || "unknown";

        // Parse the text input - handle newlines, commas, and whitespace
        const usernames = requestData.text
          .split(/[\n,]+/) // Split on newlines or commas
          .map((username: string) => username.trim()) // Remove whitespace
          .filter((username: string) => username.length > 0) // Remove empty entries
          .filter((username: string) => /^[a-zA-Z0-9_]{1,16}$/.test(username)); // Validate Minecraft username format

        if (usernames.length === 0) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "No valid Minecraft usernames found in the provided text.",
                400,
                req.requestId
              )
            );
        }

        log.info(
          `[Minecraft Text Import] Starting text-based import for guild ${guildId}, ${usernames.length} usernames by staff ${staffMemberId}`
        );

        // Convert usernames to whitelist format (without UUIDs for text import)
        whitelistData = usernames.map((username: string) => ({
          name: username.toLowerCase(),
          uuid: null, // We don't have UUIDs for manual text import
          source: "manual",
          staffMemberId,
        }));
      } else {
        // Handle traditional JSON whitelist format
        if (!Array.isArray(requestData)) {
          return res
            .status(400)
            .json(
              createErrorResponse(
                "Invalid whitelist format. Expected array of player objects or text import with method='text'.",
                400,
                req.requestId
              )
            );
        }
        whitelistData = requestData;
      }

      log.info(
        `[Minecraft Import] Starting optimized whitelist import for guild ${guildId}, ${
          whitelistData.length
        } ${isTextImport ? "text usernames" : "players"}`
      );

      // Validate and prepare data in batch
      const validPlayers: Array<{
        username: string;
        uuid: string | null;
        originalEntry: any;
        isTextImport?: boolean;
        staffMemberId?: string;
      }> = [];
      const errors: string[] = [];

      // First pass: validate all entries
      for (const playerEntry of whitelistData) {
        if (isTextImport) {
          // For text imports, we only have usernames
          if (!playerEntry.name) {
            errors.push(`Invalid text entry: missing name - ${JSON.stringify(playerEntry)}`);
            continue;
          }
          validPlayers.push({
            username: playerEntry.name.toLowerCase(),
            uuid: null, // No UUID for text imports
            originalEntry: playerEntry,
            isTextImport: true,
            staffMemberId: playerEntry.staffMemberId,
          });
        } else {
          // For JSON imports, require both name and uuid
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
            isTextImport: false,
          });
        }
      }

      if (validPlayers.length === 0) {
        return res.json(
          createSuccessResponse(
            {
              totalProcessed: whitelistData.length,
              imported: 0,
              updated: 0,
              skipped: 0,
              errors: errors.length,
              errorDetails: errors,
              processedPlayers: [],
            },
            req.requestId
          )
        );
      }

      log.info(
        `[Minecraft Import] Starting individual processing for ${validPlayers.length} players`
      );

      // Process each player individually for better debugging
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const processedPlayers: any[] = [];

      for (const { username, uuid, isTextImport, staffMemberId } of validPlayers) {
        try {
          // Check if player already exists
          const { data: existingPlayer } = await tryCatch(
            MinecraftPlayer.findOne({
              guildId,
              minecraftUsername: username,
            }).lean()
          );

          if (existingPlayer) {
            // Update existing player
            const updateData: any = {
              whitelistedAt: new Date(),
              minecraftUsername: username,
              updatedAt: new Date(),
            };

            if (uuid) {
              updateData.minecraftUuid = uuid;
            }

            const { data: updateResult, error: updateError } = await tryCatch(
              MinecraftPlayer.findOneAndUpdate({ _id: existingPlayer._id }, updateData, {
                new: true,
              })
            );

            if (updateError) {
              errors.push(`Failed to update ${username}: ${updateError.message}`);
              processedPlayers.push({
                username,
                action: "error",
                error: updateError.message,
              });
            } else {
              updatedCount++;
              processedPlayers.push({
                username,
                action: "updated",
                playerId: existingPlayer._id,
              });
              log.debug(`[Minecraft Import] Updated player: ${username}`);
            }
          } else {
            // Create new player
            const createData: any = {
              guildId,
              minecraftUsername: username,
              source: "imported",
              whitelistedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            if (uuid) {
              createData.minecraftUuid = uuid;
            }

            const { data: createResult, error: createError } = await tryCatch(
              MinecraftPlayer.create(createData)
            );

            if (createError) {
              log.error(`[Minecraft Import] CREATE ERROR for ${username}:`, createError);
              if ((createError as any).code === 11000) {
                // Duplicate key - this shouldn't happen now but just in case
                skippedCount++;
                processedPlayers.push({
                  username,
                  action: "skipped",
                  reason: "duplicate",
                });
                log.debug(`[Minecraft Import] Skipped duplicate: ${username}`);
              } else {
                errors.push(`Failed to create ${username}: ${createError.message}`);
                processedPlayers.push({
                  username,
                  action: "error",
                  error: createError.message,
                });
              }
            } else {
              importedCount++;
              processedPlayers.push({
                username,
                action: "created",
                playerId: createResult._id,
              });
              log.info(
                `[Minecraft Import] ✅ SUCCESSFULLY CREATED player: ${username} with ID: ${createResult._id}`
              );

              // Verify the player was actually saved by immediately querying it back
              const { data: verifyPlayer } = await tryCatch(
                MinecraftPlayer.findById(createResult._id).lean()
              );

              if (verifyPlayer) {
                log.info(
                  `[Minecraft Import] ✅ VERIFIED player exists in DB: ${verifyPlayer.minecraftUsername}`
                );
              } else {
                log.error(
                  `[Minecraft Import] ❌ VERIFICATION FAILED: Player ${username} with ID ${createResult._id} NOT FOUND in database immediately after creation!`
                );
              }
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Failed to process ${username}: ${errorMessage}`);
          processedPlayers.push({
            username,
            action: "error",
            error: errorMessage,
          });
        }
      }

      const summary = {
        totalProcessed: whitelistData.length,
        validated: validPlayers.length,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
        errorDetails: errors,
        importType: isTextImport ? "text" : "json",
        processedPlayers, // Detailed results for debugging
        performance: {
          individualProcessing: true,
        },
      };

      log.info(`[Minecraft Import] Individual processing completed for guild ${guildId}:`, {
        ...summary,
        processedPlayers: `${processedPlayers.length} players processed`,
      });

      // Final verification: Count total players in database
      const { data: totalPlayersCount } = await tryCatch(MinecraftPlayer.countDocuments());
      log.info(`[Minecraft Import] Total players in database after import: ${totalPlayersCount}`);

      // Sample a few created players to verify they exist
      if (processedPlayers.length > 0) {
        const createdPlayers = processedPlayers.filter((p) => p.action === "created");
        if (createdPlayers.length > 0) {
          log.info(`[Minecraft Import] Sampling created players for verification...`);
          for (let i = 0; i < Math.min(3, createdPlayers.length); i++) {
            const player = createdPlayers[i];
            const { data: samplePlayer } = await tryCatch(
              MinecraftPlayer.findOne({ minecraftUsername: player.username }).lean()
            );
            if (samplePlayer) {
              log.info(`[Minecraft Import] ✅ Sample verification: ${player.username} exists`);
            } else {
              log.error(
                `[Minecraft Import] ❌ Sample verification FAILED: ${player.username} NOT FOUND`
              );
            }
          }
        }
      }

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
   * PUT /api/minecraft/:guildId/players/:playerId
   * Update a player's information (username, UUID, Discord ID, notes)
   */
  router.put(
    "/:guildId/players/:playerId",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;
      const { minecraftUsername, minecraftUuid, discordId, notes } = req.body;

      // Validation
      if (!minecraftUsername) {
        return res
          .status(400)
          .json(createErrorResponse("minecraftUsername is required", 400, req.requestId));
      }

      // Find the player and verify guild ownership
      const { data: player, error: findError } = await tryCatch(
        MinecraftPlayer.findOne({ _id: playerId, guildId }).lean()
      );

      if (findError || !player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      // Check if another player already has this username (excluding current player)
      const { data: existingUsernamePlayer } = await tryCatch(
        MinecraftPlayer.findOne({
          guildId,
          minecraftUsername: minecraftUsername.toLowerCase(),
          _id: { $ne: playerId },
        }).lean()
      );

      if (existingUsernamePlayer) {
        return res
          .status(409)
          .json(
            createErrorResponse(
              `Another player already has the username: ${minecraftUsername}`,
              409,
              req.requestId
            )
          );
      }

      // Check if another player already has this UUID (if provided and not null)
      if (minecraftUuid) {
        const { data: existingUuidPlayer } = await tryCatch(
          MinecraftPlayer.findOne({
            guildId,
            minecraftUuid: minecraftUuid,
            _id: { $ne: playerId },
          }).lean()
        );

        if (existingUuidPlayer) {
          return res
            .status(409)
            .json(
              createErrorResponse(
                `Another player already has the UUID: ${minecraftUuid}`,
                409,
                req.requestId
              )
            );
        }
      }

      // Check if another player already has this Discord ID (if provided)
      if (discordId) {
        const { data: existingDiscordPlayer } = await tryCatch(
          MinecraftPlayer.findOne({
            guildId,
            discordId: discordId,
            _id: { $ne: playerId },
          }).lean()
        );

        if (existingDiscordPlayer) {
          return res
            .status(409)
            .json(
              createErrorResponse(
                `Another player is already linked to Discord ID: ${discordId}`,
                409,
                req.requestId
              )
            );
        }
      }

      // Prepare update data
      const updateData: any = {
        minecraftUsername: minecraftUsername.toLowerCase(),
        updatedAt: new Date(),
      };

      // Handle UUID - set to null if empty string, otherwise use provided value
      if (minecraftUuid === null || minecraftUuid === "") {
        updateData.minecraftUuid = null;
      } else if (minecraftUuid) {
        updateData.minecraftUuid = minecraftUuid;
      }

      // Handle Discord ID - set to null if empty string, otherwise use provided value
      if (discordId === null || discordId === "") {
        updateData.discordId = null;
        updateData.discordUsername = null;
        updateData.discordDisplayName = null;
      } else if (discordId) {
        updateData.discordId = discordId;
      }

      // Handle notes
      if (notes === null || notes === "") {
        updateData.notes = null;
      } else if (notes) {
        updateData.notes = notes;
      }

      // Update the player
      const { data: updatedPlayer, error: updateError } = await tryCatch(
        MinecraftPlayer.findOneAndUpdate({ _id: playerId, guildId }, updateData, { new: true })
      );

      if (updateError || !updatedPlayer) {
        log.error(`[Minecraft Update] Failed to update player ${playerId}:`, updateError);
        return res
          .status(500)
          .json(createErrorResponse("Failed to update player", 500, req.requestId));
      }

      log.info(
        `[Minecraft Update] Successfully updated player ${updatedPlayer.minecraftUsername} in guild ${guildId}`
      );

      return res.json(
        createSuccessResponse(
          {
            message: "Player updated successfully",
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
          minecraftUsername: minecraftUsername.toLowerCase(),
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
            minecraftUsername: minecraftUsername.toLowerCase(),
            discordId,
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

  /**
   * GET /api/minecraft/:guildId/role-sync/logs
   * Get role sync logs for a guild
   */
  router.get(
    "/:guildId/role-sync/logs",
    authenticateApiKey,
    requireScope("minecraft:read"),
    asyncHandler(async (req, res) => {
      const { guildId } = req.params;
      const { limit = 50, playerId } = req.query;

      const logs = await RoleSyncService.getRoleSyncLogs(
        guildId,
        parseInt(limit as string) || 50,
        playerId as string
      );

      return res.json(createSuccessResponse(logs, req.requestId));
    })
  );

  /**
   * POST /api/minecraft/:guildId/players/:playerId/role-sync
   * Manually trigger role sync for a specific player
   */
  router.post(
    "/:guildId/players/:playerId/role-sync",
    authenticateApiKey,
    requireScope("minecraft:admin"),
    asyncHandler(async (req, res) => {
      const { guildId, playerId } = req.params;

      // Get player data
      const { data: player, error: playerError } = await tryCatch(
        MinecraftPlayer.findOne({ _id: playerId, guildId }).lean()
      );

      if (playerError || !player) {
        return res.status(404).json(createErrorResponse("Player not found", 404, req.requestId));
      }

      if (!player.discordId) {
        return res
          .status(400)
          .json(createErrorResponse("Player is not linked to Discord", 400, req.requestId));
      }

      // Initialize role sync service
      const roleSyncService = new RoleSyncService(res.locals.client);

      // Calculate role sync with empty current groups (manual sync)
      const roleSyncResult = await roleSyncService.calculateRoleSync(guildId, playerId, []);

      if (!roleSyncResult.enabled) {
        return res
          .status(400)
          .json(createErrorResponse("Role sync is not enabled for this guild", 400, req.requestId));
      }

      // Log the manual sync operation
      if (roleSyncResult.operation) {
        roleSyncResult.operation.syncTrigger = "manual";
        await RoleSyncService.logRoleSync(guildId, roleSyncResult.operation);
      }

      return res.json(
        createSuccessResponse(
          {
            message: "Role sync calculated successfully",
            targetGroups: roleSyncResult.targetGroups,
            managedGroups: roleSyncResult.managedGroups,
            operation: roleSyncResult.operation,
          },
          req.requestId
        )
      );
    })
  );

  return router;
}
