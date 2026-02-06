/**
 * /dice — Bet Heimdall Coins on a dice game
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder().setName("dice").setDescription("Bet Heimdall Coins on a dice game!");

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply();

  const pluginAPI = getPluginAPI<MinigamesPluginAPI>("minigames");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minigames plugin not loaded.");
    return;
  }

  await pluginAPI.economyService.showDiceSelection(interaction);
}
