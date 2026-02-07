/**
 * Reminders Plugin — Personal reminders with context-aware ticket/modmail integration
 *
 * Provides:
 * - /remindme <time> <message> — Quick reminder creation with natural language time parsing
 * - /reminders — Interactive CRUD panel with pagination, modals, and context display
 * - Background polling (10s) with DM delivery and rich context embeds
 * - Dashboard API routes for full CRUD
 * - Auto-detect ticket/modmail context when creating reminders in those channels
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import model to register with Mongoose
import "./models/Reminder.js";

// Import service
import { ReminderService } from "./services/ReminderService.js";

/** Public API exposed to other plugins */
export interface RemindersPluginAPI extends PluginAPI {
  version: string;
  reminderService: ReminderService;
  lib: LibAPI;
}

let reminderService: ReminderService;

export async function onLoad(context: PluginContext): Promise<RemindersPluginAPI> {
  const { client, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("reminders requires lib plugin");

  // Initialize service
  reminderService = new ReminderService(client, lib);

  // Start background polling
  reminderService.start();

  logger.info("✅ Reminders plugin loaded (polling active)");

  return {
    version: "1.0.0",
    reminderService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  if (reminderService) {
    reminderService.stop();
  }
  logger.info("🛑 Reminders plugin unloaded (polling stopped)");
}

export const commands = "./commands";
export const api = "./api";
