/**
 * Tags Plugin — Guild-specific text tags with CRUD, usage tracking, and autocomplete
 *
 * Provides:
 * - Per-guild tags with unique names, content up to 2000 chars, and usage counters
 * - /tag use|create|edit|delete|list commands with autocomplete
 * - Dashboard API routes for full CRUD and usage tracking
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import model to register with Mongoose
import "./models/Tag.js";

// Import service
import { TagService } from "./services/TagService.js";

/** Public API exposed to other plugins */
export interface TagsPluginAPI extends PluginAPI {
  version: string;
  tagService: TagService;
  lib: LibAPI;
}

let tagService: TagService;

export async function onLoad(context: PluginContext): Promise<TagsPluginAPI> {
  const { logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("tags requires lib plugin");

  // Initialize service
  tagService = new TagService();

  logger.info("✅ Tags plugin loaded");

  return {
    version: "1.0.0",
    tagService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Tags plugin unloaded");
}

export const commands = "./commands";
export const api = "./api";
