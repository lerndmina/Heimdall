/**
 * Minigames Plugin — Fun games and economy system
 *
 * Provides:
 * - Connect4 and TicTacToe board games with persistent buttons
 * - HeimdallCoin virtual economy (daily claims, dice gambling)
 * - Simple fun commands (coinflip, emojify, poke, therules, randbetween)
 * - Owner-only game-admin panel for managing active games
 */

import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

// Import models to register with Mongoose
import "./models/Connect4.js";
import "./models/TicTacToe.js";
import "./models/HeimdallCoin.js";

// Import services
import { GameService } from "./services/GameService.js";
import { EconomyService } from "./services/EconomyService.js";

/** Public API exposed to other plugins and commands */
export interface MinigamesPluginAPI extends PluginAPI {
  version: string;
  lib: LibAPI;
  gameService: GameService;
  economyService: EconomyService;
}

let gameService: GameService;
let economyService: EconomyService;

export async function onLoad(context: PluginContext): Promise<MinigamesPluginAPI> {
  const { client, logger, dependencies } = context;

  // Get lib dependency
  const lib = dependencies.get("lib") as LibAPI | undefined;
  if (!lib) throw new Error("minigames requires lib plugin");

  // Initialize services
  gameService = new GameService(client, lib);
  gameService.initialize();

  economyService = new EconomyService(lib);

  logger.info("✅ Minigames plugin loaded");

  return {
    version: "1.0.0",
    lib,
    gameService,
    economyService,
  };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  logger.info("🛑 Minigames plugin unloaded");
}

export const commands = "./commands";
