/**
 * GET /api/guilds/:guildId/minecraft/config
 * PUT /api/guilds/:guildId/minecraft/config
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { MinecraftApiDependencies } from "./index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";

/**
 * Maps dashboard field names to model field names.
 * The dashboard uses friendlier naming; the model has historical naming.
 */
function dashboardToModel(data: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = { ...data };

  // Map dashboard → model field names
  if ("serverIp" in mapped) {
    mapped.serverHost = mapped.serverIp;
    delete mapped.serverIp;
  }
  if ("enableAutoRevoke" in mapped) {
    if (!mapped.leaveRevocation) mapped.leaveRevocation = {};
    mapped.leaveRevocation.enabled = mapped.enableAutoRevoke;
    delete mapped.enableAutoRevoke;
  }
  if ("enableAutoRestore" in mapped) {
    mapped.autoLinkOnJoin = mapped.enableAutoRestore;
    delete mapped.enableAutoRestore;
  }
  if ("enableRoleSync" in mapped) {
    if (!mapped.roleSync) mapped.roleSync = {};
    mapped.roleSync.enabled = mapped.enableRoleSync;
    delete mapped.enableRoleSync;
  }
  if ("requireDiscordLink" in mapped) {
    mapped.requireConfirmation = mapped.requireDiscordLink;
    delete mapped.requireDiscordLink;
  }
  // Map whitelist schedule fields into nested object
  if ("whitelistScheduleType" in mapped || "whitelistDelayMinutes" in mapped || "whitelistScheduledDay" in mapped) {
    mapped.whitelistSchedule = {
      type: mapped.whitelistScheduleType ?? "immediate",
      delayMinutes: mapped.whitelistDelayMinutes ?? 0,
      scheduledDay: mapped.whitelistScheduledDay ?? 0,
    };
    // When autoWhitelist is off, staff approval is implicit
    if (!mapped.autoWhitelist) mapped.requireApproval = true;
    else mapped.requireApproval = false;
    delete mapped.whitelistScheduleType;
    delete mapped.whitelistDelayMinutes;
    delete mapped.whitelistScheduledDay;
  }
  if ("cacheTimeout" in mapped) {
    mapped.authCodeExpiry = mapped.cacheTimeout;
    delete mapped.cacheTimeout;
  }

  return mapped;
}

/**
 * Maps model field names to dashboard-friendly names for the GET response.
 */
function modelToDashboard(config: Record<string, any>): Record<string, any> {
  return {
    guildId: config.guildId,
    enabled: config.enabled ?? false,
    autoWhitelist: config.autoWhitelist ?? false,
    whitelistScheduleType: config.whitelistSchedule?.type ?? "immediate",
    whitelistDelayMinutes: config.whitelistSchedule?.delayMinutes ?? 0,
    whitelistScheduledDay: config.whitelistSchedule?.scheduledDay ?? 0,
    serverName: config.serverName ?? "",
    serverIp: config.serverHost ?? "",
    serverPort: config.serverPort ?? 25565,
    rconEnabled: config.rconEnabled ?? false,
    rconHost: config.rconHost ?? "",
    rconPort: config.rconPort ?? 25575,
    rconPassword: config.rconPassword ? "***" : null,
    cacheTimeout: config.authCodeExpiry ?? 300,
    maxPlayersPerUser: config.maxPlayersPerUser ?? 1,
    requireDiscordLink: config.requireConfirmation ?? true,
    enableRoleSync: config.roleSync?.enabled ?? false,
    enableMinecraftPlugin: config.enableMinecraftPlugin ?? false,
    enableAutoRevoke: config.leaveRevocation?.enabled ?? false,
    enableAutoRestore: config.autoLinkOnJoin ?? false,
  };
}

export function createConfigRoutes(deps: MinecraftApiDependencies): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const config = await MinecraftConfig.findOne({ guildId }).lean();

      if (!config) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "No Minecraft configuration found" },
        });
        return;
      }

      res.json({
        success: true,
        data: modelToDashboard(config),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { guildId } = req.params;
      const updateData = req.body;

      if (!updateData || typeof updateData !== "object") {
        res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Request body must be an object" },
        });
        return;
      }

      // Prevent changing guildId
      delete updateData.guildId;
      delete updateData._id;

      // Map dashboard field names to model fields
      const modelData = dashboardToModel(updateData);

      const config = await MinecraftConfig.findOneAndUpdate({ guildId }, { ...modelData, guildId }, { upsert: true, new: true, runValidators: true }).lean();

      res.json({
        success: true,
        data: modelToDashboard(config),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
