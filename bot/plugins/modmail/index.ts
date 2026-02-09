/**
 * Modmail Plugin
 *
 * DM-based modmail support system with forum threads and webhook relay.
 * This is the main entry point for the modmail plugin.
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { SupportCoreAPI } from "../support-core/index.js";

// Import services
import { ModmailService } from "./services/ModmailService.js";
import { ModmailCategoryService } from "./services/ModmailCategoryService.js";
import { ModmailCreationService } from "./services/ModmailCreationService.js";
import { ModmailSessionService } from "./services/ModmailSessionService.js";
import { ModmailFlowService } from "./services/ModmailFlowService.js";
import { ModmailInteractionService } from "./services/ModmailInteractionService.js";
import { BackgroundModmailService } from "./services/BackgroundModmailService.js";
import { ModmailQuestionHandler } from "./utils/ModmailQuestionHandler.js";
import { ModmailWebSocketService, type WebSocketServer } from "./websocket/ModmailWebSocketService.js";

// Re-export models
export * from "./models/index.js";

// Re-export services
export * from "./services/index.js";

// Re-export utilities
export * from "./utils/index.js";

/**
 * API exposed by modmail plugin
 */
export interface ModmailPluginAPI extends PluginAPI {
  version: string;

  // Services
  modmailService: ModmailService;
  categoryService: ModmailCategoryService;
  creationService: ModmailCreationService;
  sessionService: ModmailSessionService;
  flowService: ModmailFlowService;
  interactionService: ModmailInteractionService;
  backgroundService: BackgroundModmailService;
  questionHandler: ModmailQuestionHandler;

  // Dependencies
  lib: LibAPI;
  supportCore: SupportCoreAPI;

  // Config
  encryptionKey: string;
}

// Global plugin API reference (populated during onLoad)
let pluginAPI: ModmailPluginAPI | null = null;

/**
 * Get the modmail plugin API (for use in commands/events)
 */
export function getModmailAPI(): ModmailPluginAPI | null {
  return pluginAPI;
}

/**
 * Plugin load handler
 */
export async function onLoad(context: PluginContext): Promise<ModmailPluginAPI> {
  const { logger, redis, client, dependencies, wsManager } = context;

  // Get encryption key from environment
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY environment variable is required for modmail plugin");
  }

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI;
  if (!lib) {
    throw new Error("modmail plugin requires lib plugin");
  }

  // Get support-core dependency
  const supportCore = dependencies.get("support-core") as SupportCoreAPI;
  if (!supportCore) {
    throw new Error("modmail plugin requires support-core plugin");
  }

  // Initialize core services
  const modmailService = new ModmailService(client, encryptionKey, logger, supportCore);
  const categoryService = new ModmailCategoryService(modmailService, encryptionKey, logger);
  const sessionService = new ModmailSessionService(redis, logger);

  // Initialize creation service
  const creationService = new ModmailCreationService(client, modmailService, categoryService, lib, logger);

  // Initialize flow service
  const flowService = new ModmailFlowService(client, modmailService, lib, logger);

  // Initialize WebSocket service (optional)
  let modmailWebSocket: ModmailWebSocketService | null = null;
  if (wsManager) {
    const adapter: WebSocketServer = {
      to(room: string) {
        return {
          emit(event: string, data: unknown) {
            const guildId = room.replace("guild:", "");
            wsManager.broadcastToGuild(guildId, event, data);
          },
        };
      },
    };

    modmailWebSocket = new ModmailWebSocketService(adapter);
    modmailService.setWebSocketService(modmailWebSocket);
    flowService.setWebSocketService(modmailWebSocket);
  }

  // Wire up flow service reference in creation service (avoids circular dep at construction)
  creationService.setFlowService(flowService);

  // Initialize question handler
  const questionHandler = new ModmailQuestionHandler(client, sessionService, creationService, lib, logger);

  // Initialize interaction service
  const interactionService = new ModmailInteractionService(client, modmailService, sessionService, creationService, categoryService, lib, lib.componentCallbackService, logger, supportCore);

  // Initialize interaction handlers
  await interactionService.initialize();

  // Initialize background service
  const backgroundService = new BackgroundModmailService(client, modmailService, lib.thingGetter, lib, logger);
  backgroundService.start();

  logger.debug("modmail plugin loaded");

  // Create API object
  pluginAPI = {
    version: "1.0.0",
    modmailService,
    categoryService,
    creationService,
    sessionService,
    flowService,
    interactionService,
    backgroundService,
    questionHandler,
    lib,
    supportCore,
    encryptionKey,
  };

  return pluginAPI;
}

/**
 * Plugin disable handler
 */
export async function onDisable(logger: PluginLogger): Promise<void> {
  if (pluginAPI?.backgroundService) {
    pluginAPI.backgroundService.stop();
  }
  pluginAPI = null;
  logger.debug("modmail plugin disabled");
}

// Command and event paths for plugin loader
export const commands = "./commands";
export const events = "./events";
export const api = "./api";
