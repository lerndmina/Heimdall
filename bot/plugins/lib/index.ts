import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { ButtonInteraction, StringSelectMenuInteraction, RoleSelectMenuInteraction, UserSelectMenuInteraction, ChannelSelectMenuInteraction, MentionableSelectMenuInteraction } from "discord.js";
import type { ComponentCallbackService } from "../../src/core/services/ComponentCallbackService.js";
import { ThingGetter } from "./utils/ThingGetter.js";
import { HeimdallEmbedBuilder } from "./utils/components/HeimdallEmbedBuilder.js";
import { HeimdallButtonBuilder } from "./utils/components/HeimdallButtonBuilder.js";
import { HeimdallStringSelectMenuBuilder } from "./utils/components/HeimdallStringSelectMenuBuilder.js";
import { HeimdallRoleSelectMenuBuilder } from "./utils/components/HeimdallRoleSelectMenuBuilder.js";
import { HeimdallUserSelectMenuBuilder } from "./utils/components/HeimdallUserSelectMenuBuilder.js";
import { HeimdallChannelSelectMenuBuilder } from "./utils/components/HeimdallChannelSelectMenuBuilder.js";
import { HeimdallMentionableSelectMenuBuilder } from "./utils/components/HeimdallMentionableSelectMenuBuilder.js";
import { parseTime, parseDuration, type ParseTimeResult } from "./utils/parseTime.js";
import { getRandomFooterMessage, isAprilFools, APRIL_FOOLS_MESSAGES, REGULAR_MESSAGES } from "./utils/messages.js";
import { tryCatch, tryCatchSync, type Result, type Success, type Failure } from "./utils/tryCatch.js";

// Export types for plugins to use
export type { ParseTimeResult, Result, Success, Failure };

// Library API interface
export interface LibAPI extends PluginAPI {
  version: string;

  // ThingGetter for Discord entity fetching
  thingGetter: ThingGetter;

  // Component callback service for persistent handlers
  componentCallbackService: ComponentCallbackService;

  // Component builders (factory functions that bind to context)
  createEmbedBuilder: () => HeimdallEmbedBuilder;
  createButtonBuilder: (callback: (interaction: ButtonInteraction) => Promise<void>, ttl?: number) => HeimdallButtonBuilder;
  createButtonBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallButtonBuilder;
  createStringSelectMenuBuilder: (callback: (interaction: StringSelectMenuInteraction) => Promise<void>, ttl?: number) => HeimdallStringSelectMenuBuilder;
  createStringSelectMenuBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallStringSelectMenuBuilder;
  createRoleSelectMenuBuilder: (callback: (interaction: RoleSelectMenuInteraction) => Promise<void>, ttl?: number) => HeimdallRoleSelectMenuBuilder;
  createRoleSelectMenuBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallRoleSelectMenuBuilder;
  createUserSelectMenuBuilder: (callback: (interaction: UserSelectMenuInteraction) => Promise<void>, ttl?: number) => HeimdallUserSelectMenuBuilder;
  createUserSelectMenuBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallUserSelectMenuBuilder;
  createChannelSelectMenuBuilder: (callback: (interaction: ChannelSelectMenuInteraction) => Promise<void>, ttl?: number) => HeimdallChannelSelectMenuBuilder;
  createChannelSelectMenuBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallChannelSelectMenuBuilder;
  createMentionableSelectMenuBuilder: (callback: (interaction: MentionableSelectMenuInteraction) => Promise<void>, ttl?: number) => HeimdallMentionableSelectMenuBuilder;
  createMentionableSelectMenuBuilderPersistent: (handlerId: string, metadata?: Record<string, unknown>) => HeimdallMentionableSelectMenuBuilder;

  // Time parsing
  parseTime: typeof parseTime;
  parseDuration: typeof parseDuration;

  // Messages
  getRandomFooterMessage: typeof getRandomFooterMessage;
  isAprilFools: typeof isAprilFools;
  REGULAR_MESSAGES: typeof REGULAR_MESSAGES;
  APRIL_FOOLS_MESSAGES: typeof APRIL_FOOLS_MESSAGES;

  // Try-catch utilities
  tryCatch: typeof tryCatch;
  tryCatchSync: typeof tryCatchSync;

  // Direct access to builders for advanced usage
  builders: {
    HeimdallEmbedBuilder: typeof HeimdallEmbedBuilder;
    HeimdallButtonBuilder: typeof HeimdallButtonBuilder;
    HeimdallStringSelectMenuBuilder: typeof HeimdallStringSelectMenuBuilder;
    HeimdallRoleSelectMenuBuilder: typeof HeimdallRoleSelectMenuBuilder;
    HeimdallUserSelectMenuBuilder: typeof HeimdallUserSelectMenuBuilder;
    HeimdallChannelSelectMenuBuilder: typeof HeimdallChannelSelectMenuBuilder;
    HeimdallMentionableSelectMenuBuilder: typeof HeimdallMentionableSelectMenuBuilder;
  };
}

let thingGetterInstance: ThingGetter | null = null;

export async function onLoad(context: PluginContext): Promise<LibAPI> {
  const { client, logger, componentCallbackService } = context;

  // Initialize ThingGetter with the Discord client
  thingGetterInstance = new ThingGetter(client);
  logger.info("ThingGetter initialized");

  // Initialize component builders with the callback service
  HeimdallButtonBuilder.setCallbackService(componentCallbackService);
  HeimdallStringSelectMenuBuilder.setCallbackService(componentCallbackService);
  HeimdallRoleSelectMenuBuilder.setCallbackService(componentCallbackService);
  HeimdallUserSelectMenuBuilder.setCallbackService(componentCallbackService);
  HeimdallChannelSelectMenuBuilder.setCallbackService(componentCallbackService);
  HeimdallMentionableSelectMenuBuilder.setCallbackService(componentCallbackService);
  logger.info("Component builders initialized with callback service");

  logger.info("Library plugin loaded successfully");

  return {
    version: "1.0.0",

    thingGetter: thingGetterInstance,

    // Component callback service for persistent handlers
    componentCallbackService,

    // Factory functions for component builders
    createEmbedBuilder: () => new HeimdallEmbedBuilder(),
    createButtonBuilder: (callback, ttl) => new HeimdallButtonBuilder(callback, ttl),
    createButtonBuilderPersistent: (handlerId, metadata) => new HeimdallButtonBuilder(handlerId, metadata),
    createStringSelectMenuBuilder: (callback, ttl) => new HeimdallStringSelectMenuBuilder(callback, ttl),
    createStringSelectMenuBuilderPersistent: (handlerId, metadata) => new HeimdallStringSelectMenuBuilder(handlerId, metadata),
    createRoleSelectMenuBuilder: (callback, ttl) => new HeimdallRoleSelectMenuBuilder(callback, ttl),
    createRoleSelectMenuBuilderPersistent: (handlerId, metadata) => new HeimdallRoleSelectMenuBuilder(handlerId, metadata),
    createUserSelectMenuBuilder: (callback, ttl) => new HeimdallUserSelectMenuBuilder(callback, ttl),
    createUserSelectMenuBuilderPersistent: (handlerId, metadata) => new HeimdallUserSelectMenuBuilder(handlerId, metadata),
    createChannelSelectMenuBuilder: (callback, ttl) => new HeimdallChannelSelectMenuBuilder(callback, ttl),
    createChannelSelectMenuBuilderPersistent: (handlerId, metadata) => new HeimdallChannelSelectMenuBuilder(handlerId, metadata),
    createMentionableSelectMenuBuilder: (callback, ttl) => new HeimdallMentionableSelectMenuBuilder(callback, ttl),
    createMentionableSelectMenuBuilderPersistent: (handlerId, metadata) => new HeimdallMentionableSelectMenuBuilder(handlerId, metadata),

    // Utilities
    parseTime,
    parseDuration,
    getRandomFooterMessage,
    isAprilFools,
    REGULAR_MESSAGES,
    APRIL_FOOLS_MESSAGES,
    tryCatch,
    tryCatchSync,

    // Direct builder access
    builders: {
      HeimdallEmbedBuilder,
      HeimdallButtonBuilder,
      HeimdallStringSelectMenuBuilder,
      HeimdallRoleSelectMenuBuilder,
      HeimdallUserSelectMenuBuilder,
      HeimdallChannelSelectMenuBuilder,
      HeimdallMentionableSelectMenuBuilder,
    },
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("Plugin disabled");
  thingGetterInstance = null;
}
