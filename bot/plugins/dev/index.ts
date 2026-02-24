import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { CommandManager } from "../../src/core/CommandManager.js";
import type { RedisClientType } from "redis";
import type mongoose from "mongoose";
import type { HeimdallClient } from "../../src/types/Client.js";
import type { WebSocketManager } from "../../src/core/WebSocketManager.js";
import type { EventManager } from "../../src/core/EventManager.js";
import type { ApiManager } from "../../src/core/ApiManager.js";
import type { ComponentCallbackService } from "../../src/core/services/ComponentCallbackService.js";
import type { PermissionRegistry } from "../../src/core/PermissionRegistry.js";
import BotActivityModel from "./models/BotActivityModel.js";
import { activityRotationService, applyPreset } from "./services/ActivityRotationService.js";
import { taskRegistry } from "./services/BackgroundTaskRegistry.js";

export const commands = "./commands";
export const api = "./api";

// ── Module-level service references for the dev panel ──────────────────────
let _commandManager: CommandManager;
let _redis: RedisClientType;
let _mongoose: typeof mongoose;
let _client: HeimdallClient;
let _wsManager: WebSocketManager;
let _eventManager: EventManager;
let _apiManager: ApiManager;
let _componentCallbackService: ComponentCallbackService;
let _permissionRegistry: PermissionRegistry;

/** Retrieve stored core service references (available after onLoad). */
export function getDevServices() {
  return {
    commandManager: _commandManager,
    redis: _redis,
    mongoose: _mongoose,
    client: _client,
    wsManager: _wsManager,
    eventManager: _eventManager,
    apiManager: _apiManager,
    componentCallbackService: _componentCallbackService,
    permissionRegistry: _permissionRegistry,
  };
}

export async function onLoad(context: PluginContext): Promise<PluginAPI> {
  const { client, logger, commandManager, redis, mongoose, wsManager, eventManager, apiManager, componentCallbackService, permissionRegistry } = context;

  // Store references for the dev panel
  _commandManager = commandManager;
  _redis = redis;
  _mongoose = mongoose;
  _client = client as unknown as HeimdallClient;
  _wsManager = wsManager;
  _eventManager = eventManager;
  _apiManager = apiManager;
  _componentCallbackService = componentCallbackService;
  _permissionRegistry = permissionRegistry;

  // Register the activity rotation task
  taskRegistry.register({
    id: "activity-rotation",
    plugin: "dev",
    label: "Activity Rotation",
    intervalMs: 0, // dynamic, set on start
    isRunning: activityRotationService.isRunning,
    description: "Cycles bot presence through saved presets",
  });

  // ── Restore persisted activity/rotation on startup ───────────────────────
  try {
    const config = await BotActivityModel.findById("global").lean();
    if (config) {
      if (config.rotation?.enabled && config.presets.length > 0) {
        logger.info(`Dev: resuming activity rotation (${config.presets.length} presets, every ${config.rotation.intervalSeconds}s)`);
        activityRotationService.start(client, config.presets, config.rotation.intervalSeconds, config.status ?? "online");
      } else if (config.activePresetId) {
        const preset = config.presets.find((p) => p.id === config.activePresetId);
        if (preset) {
          logger.info(`Dev: restoring activity — ${preset.name}`);
          applyPreset(client, preset, config.status ?? "online");
        }
      }
    }
  } catch (err) {
    logger.error("Dev: failed to restore activity config:", err);
  }

  logger.debug("Dev plugin loaded");
  return { version: "1.0.0" };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  activityRotationService.stop();
  logger.debug("Dev plugin disabled");
}
