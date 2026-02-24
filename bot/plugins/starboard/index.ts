/**
 * Starboard Plugin — Configurable starboard boards with optional moderation approval.
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";
import { createLogger } from "../../src/core/Logger.js";

import "./models/StarboardConfig.js";
import "./models/StarboardEntry.js";

import { StarboardService } from "./services/StarboardService.js";

const log = createLogger("starboard");

export const STARBOARD_APPROVE_HANDLER_ID = "starboard.approve";
export const STARBOARD_DENY_HANDLER_ID = "starboard.deny";

export interface StarboardPluginAPI extends PluginAPI {
  version: string;
  starboardService: StarboardService;
  lib: LibAPI;
}

let starboardService: StarboardService;

export async function onLoad(context: PluginContext): Promise<StarboardPluginAPI> {
  const { client, logger, dependencies } = context;

  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) {
    throw new Error("starboard requires lib plugin");
  }

  starboardService = new StarboardService(client, lib);

  lib.componentCallbackService.registerPersistentHandler(
    STARBOARD_APPROVE_HANDLER_ID,
    async (interaction) => {
      if (!interaction.isButton()) return;

      const metadata = await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const guildId = typeof metadata?.guildId === "string" ? metadata.guildId : null;
      const boardId = typeof metadata?.boardId === "string" ? metadata.boardId : null;
      const sourceMessageId = typeof metadata?.sourceMessageId === "string" ? metadata.sourceMessageId : null;

      if (!guildId || !boardId || !sourceMessageId) {
        await interaction.reply({ content: "❌ Invalid moderation action metadata.", ephemeral: true });
        return;
      }

      const result = await starboardService.approvePendingEntry(guildId, boardId, sourceMessageId, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return;
      }

      await interaction.reply({ content: "✅ Approved and posted to starboard.", ephemeral: true });
    },
    {
      actionKey: "interactions.starboard.moderate",
      label: "Moderate Starboard",
      description: "Approve or deny pending starboard candidates.",
    },
  );

  lib.componentCallbackService.registerPersistentHandler(
    STARBOARD_DENY_HANDLER_ID,
    async (interaction) => {
      if (!interaction.isButton()) return;

      const metadata = await lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
      const guildId = typeof metadata?.guildId === "string" ? metadata.guildId : null;
      const boardId = typeof metadata?.boardId === "string" ? metadata.boardId : null;
      const sourceMessageId = typeof metadata?.sourceMessageId === "string" ? metadata.sourceMessageId : null;

      if (!guildId || !boardId || !sourceMessageId) {
        await interaction.reply({ content: "❌ Invalid moderation action metadata.", ephemeral: true });
        return;
      }

      const result = await starboardService.denyPendingEntry(guildId, boardId, sourceMessageId, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return;
      }

      await interaction.reply({ content: "🛑 Denied. This candidate will not be posted.", ephemeral: true });
    },
    {
      actionKey: "interactions.starboard.moderate",
      label: "Moderate Starboard",
      description: "Approve or deny pending starboard candidates.",
    },
  );

  logger.info("✅ Starboard plugin loaded");
  log.debug("Persistent moderation handlers registered");

  return {
    version: "1.0.0",
    starboardService,
    lib,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Starboard plugin unloaded");
}

export const events = "./events";
export const api = "./api";
