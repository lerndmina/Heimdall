/**
 * Support Core Plugin - Foundation for tickets and modmail systems
 *
 * Provides:
 * - SupportBan model for universal bans
 * - ScheduledAction model for persistent timers
 * - SupportEventBus for hook event system
 * - ScheduledActionProcessor for processing due actions
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import { SupportEventBus } from "./services/SupportEventBus.js";
import { ScheduledActionProcessor } from "./services/ScheduledActionProcessor.js";
import SupportBan, { SupportBanType, SupportBanSystem, type ISupportBan, type ISupportBanModel } from "./models/SupportBan.js";
import ScheduledAction, { type SupportInstanceId, type IScheduledAction, type IScheduledActionModel } from "./models/ScheduledAction.js";
import {
  SupportEventType,
  type SupportEventPayload,
  type UserInteractedPayload,
  type StaffRepliedPayload,
  type SupportClaimedPayload,
  type SupportClosedPayload,
  type SupportReopenedPayload,
  type SupportEventCallback,
} from "./services/SupportEventBus.js";

// Re-export types for consumers
export type {
  ISupportBan,
  ISupportBanModel,
  IScheduledAction,
  IScheduledActionModel,
  SupportInstanceId,
  SupportEventPayload,
  UserInteractedPayload,
  StaffRepliedPayload,
  SupportClaimedPayload,
  SupportClosedPayload,
  SupportReopenedPayload,
  SupportEventCallback,
};

export { SupportBanType, SupportBanSystem, SupportEventType };

/**
 * API exposed by support-core plugin
 */
export interface SupportCoreAPI extends PluginAPI {
  version: string;

  // Models
  SupportBan: typeof SupportBan;
  ScheduledAction: typeof ScheduledAction;

  // Enums
  SupportBanType: typeof SupportBanType;
  SupportBanSystem: typeof SupportBanSystem;
  SupportEventType: typeof SupportEventType;

  // Services
  eventBus: SupportEventBus;

  // Helpers
  createSupportInstanceId: (type: "ticket" | "modmail", id: string) => SupportInstanceId;
}

let processor: ScheduledActionProcessor | null = null;

/**
 * Plugin load handler
 */
export async function onLoad(context: PluginContext): Promise<SupportCoreAPI> {
  const { logger, redis } = context;

  // Initialize Redis for SupportBan model caching
  SupportBan.setRedis(redis);
  logger.debug("Redis injected into SupportBan model");

  // Create event bus
  const eventBus = new SupportEventBus(logger);
  logger.debug("SupportEventBus created");

  // Start scheduled action processor
  processor = new ScheduledActionProcessor(eventBus, logger);
  processor.start();

  logger.info("support-core plugin loaded");

  return {
    version: "1.0.0",

    // Models
    SupportBan,
    ScheduledAction,

    // Enums
    SupportBanType,
    SupportBanSystem,
    SupportEventType,

    // Services
    eventBus,

    // Helpers
    createSupportInstanceId: (type, id) => `${type}:${id}` as SupportInstanceId,
  };
}

/**
 * Plugin disable handler
 */
export async function onDisable(logger: PluginLogger): Promise<void> {
  if (processor) {
    processor.stop();
    processor = null;
  }
  logger.info("Plugin disabled");
}
