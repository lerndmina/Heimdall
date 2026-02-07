/**
 * Suggestions Plugin — Community suggestion system with voting, categories,
 * AI-powered titles, forum/embed modes, and management workflows.
 *
 * Provides:
 * - /suggest command for submitting suggestions
 * - /suggestion-config for channel/opener/limits configuration
 * - /suggestion-categories for category management
 * - Persistent voting buttons (upvote/downvote)
 * - Staff management (approve/deny/pending)
 * - Opener panels with channel selection dropdowns
 * - Category-based suggestion routing
 * - AI title generation (per-guild OpenAI key)
 * - Dashboard API routes for config/suggestions/categories/openers CRUD
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import type { GuildEnvService } from "../../src/core/services/GuildEnvService.js";
import type { ComponentCallbackService } from "../../src/core/services/ComponentCallbackService.js";

// Import models to register with Mongoose
import "./models/Suggestion.js";
import "./models/SuggestionConfig.js";
import "./models/SuggestionOpener.js";

// Import services
import { SuggestionService } from "./services/SuggestionService.js";

/** Public API exposed to other plugins and event handlers */
export interface SuggestionsPluginAPI extends PluginAPI {
  version: string;
  suggestionService: SuggestionService;
  lib: LibAPI;
  guildEnvService: GuildEnvService;
  componentCallbackService: ComponentCallbackService;
}

let suggestionService: SuggestionService;

export async function onLoad(context: PluginContext): Promise<SuggestionsPluginAPI> {
  const { client, logger, dependencies, guildEnvService, componentCallbackService } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("suggestions requires lib plugin");

  // Initialize service
  suggestionService = new SuggestionService(client, lib, guildEnvService, componentCallbackService);
  await suggestionService.initialize();

  logger.info("✅ Suggestions plugin loaded");

  return {
    version: "1.0.0",
    suggestionService,
    lib,
    guildEnvService,
    componentCallbackService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Suggestions plugin unloaded");
}

export const commands = "./commands";
export const api = "./api";
