/**
 * Moderation Plugin — Unified automod + manual moderation with points-based
 * infraction tracking, configurable escalation tiers, and logging integration.
 *
 * Combines regex-based content filtering (automod) with manual moderation
 * commands (/kick, /ban, /unban, /mute, /warn, /purge, /infractions).
 * Both systems feed into a unified infraction pool with point decay and
 * escalation tiers.
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { LoggingPluginAPI } from "../logging/index.js";
import type { HeimdallClient } from "../../src/types/Client.js";

// Register models
import "./models/ModerationConfig.js";
import "./models/AutomodRule.js";
import "./models/Infraction.js";
import "./models/ChannelLock.js";

import { ModerationService } from "./services/ModerationService.js";
import { RuleEngine } from "./services/RuleEngine.js";
import { InfractionService } from "./services/InfractionService.js";
import { EscalationService } from "./services/EscalationService.js";
import { ModActionService } from "./services/ModActionService.js";
import { AutomodEnforcer } from "./services/AutomodEnforcer.js";
import { ChannelLockService } from "./services/ChannelLockService.js";

export interface ModerationPluginAPI extends PluginAPI {
  version: string;
  moderationService: ModerationService;
  ruleEngine: RuleEngine;
  infractionService: InfractionService;
  escalationService: EscalationService;
  modActionService: ModActionService;
  automodEnforcer: AutomodEnforcer;
  channelLockService: ChannelLockService;
  client: HeimdallClient;
  lib: LibAPI;
  logging: LoggingPluginAPI | null;
}

let moderationService: ModerationService;
let ruleEngine: RuleEngine;
let infractionService: InfractionService;
let escalationService: EscalationService;
let modActionService: ModActionService;
let automodEnforcer: AutomodEnforcer;
let channelLockService: ChannelLockService;

export async function onLoad(context: PluginContext): Promise<ModerationPluginAPI> {
  const { client, logger, dependencies, redis } = context;

  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("moderation requires lib plugin");

  const logging = (dependencies.get("logging") as LoggingPluginAPI | undefined) ?? null;

  moderationService = new ModerationService(client, redis);
  ruleEngine = new RuleEngine();
  infractionService = new InfractionService(moderationService);
  escalationService = new EscalationService(lib, logging);
  modActionService = new ModActionService(client, lib, logging, infractionService, escalationService);
  automodEnforcer = new AutomodEnforcer(client, lib, logging, moderationService, ruleEngine, infractionService, escalationService, modActionService);
  channelLockService = new ChannelLockService(client, redis, lib, logging, moderationService);

  logger.info("✅ Moderation plugin loaded");

  return {
    version: "1.0.0",
    moderationService,
    ruleEngine,
    infractionService,
    escalationService,
    modActionService,
    automodEnforcer,
    channelLockService,
    client,
    lib,
    logging,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  if (channelLockService) channelLockService.dispose();
  logger.info("🛑 Moderation plugin unloaded");
}

export const commands = "./commands";
export const events = "./events";
export const api = "./api";
