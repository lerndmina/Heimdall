import { Router, Request, Response } from "express";
import { createSuccessResponse } from "../utils/apiResponse";
import { asyncHandler } from "../middleware/errorHandler";
import { optionalApiKeyAuth } from "../middleware/auth";
import { Client } from "discord.js";

export function createBotInfoRoutes(client: Client<true>): Router {
  const router = Router();

  /**
   * GET /bot-info
   * Get basic bot information (public endpoint with optional auth for more details)
   */
  router.get(
    "/bot-info",
    optionalApiKeyAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const botUser = client.user;

        if (!botUser) {
          return res.status(503).json({
            error: "Bot is not ready",
            statusCode: 503,
            requestId: req.requestId,
          });
        }

        // Basic info available to everyone
        const basicInfo = {
          id: botUser.id,
          name: botUser.displayName || botUser.username,
          avatar: botUser.avatar,
          discriminator: botUser.discriminator,
          bot: botUser.bot,
          verified: botUser.flags?.has("VerifiedBot") || false,
        };

        // If authenticated, provide additional details
        if (req.apiKey) {
          const guildCount = client.guilds.cache.size;
          const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

          const detailedInfo = {
            ...basicInfo,
            stats: {
              guilds: guildCount,
              users: userCount,
              channels: client.channels.cache.size,
              uptime: process.uptime(),
            },
            application: {
              id: client.application?.id,
              name: client.application?.name,
              description: client.application?.description,
              public: client.application?.botPublic,
              requireCodeGrant: client.application?.botRequireCodeGrant,
            },
          };

          return res.json(createSuccessResponse(detailedInfo, req.requestId));
        }

        // Return basic info for unauthenticated requests
        res.json(createSuccessResponse(basicInfo, req.requestId));
      } catch (error) {
        throw error;
      }
    })
  );

  return router;
}
