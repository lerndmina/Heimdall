/**
 * /tictactoe <opponent> — Start a Tic-Tac-Toe game
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";
import TicTacToe from "../models/TicTacToe.js";

export const data = new SlashCommandBuilder()
  .setName("tictactoe")
  .setDescription("Start a Tic-Tac-Toe game")
  .addUserOption((opt) => opt.setName("opponent").setDescription("The user you want to play against").setRequired(true));

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

  const opponent = interaction.options.getUser("opponent", true);
  const challenger = interaction.user;

  if (opponent.id === challenger.id) {
    await interaction.editReply("❌ You cannot play against yourself!");
    return;
  }

  if (opponent.bot) {
    await interaction.editReply("❌ You cannot play against bots!");
    return;
  }

  // Check if either player already has an active game
  const existingGame = await TicTacToe.findOne({
    $or: [
      { player1: challenger.id, gameOver: false },
      { player2: challenger.id, gameOver: false },
      { player1: opponent.id, gameOver: false },
      { player2: opponent.id, gameOver: false },
    ],
  });

  if (existingGame) {
    await interaction.editReply("❌ One of the players already has an active game! Finish it first.");
    return;
  }

  const inviteEmbed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎮 Tic-Tac-Toe Game Invitation")
    .setDescription(`${challenger} has challenged ${opponent} to a game of Tic-Tac-Toe!`)
    .addFields(
      { name: "How to play", value: "Click the buttons below to place your mark. First to get 3 in a row wins!" },
      { name: "Challenger", value: `${challenger} (❌)`, inline: true },
      { name: "Opponent", value: `${opponent} (⭕)`, inline: true },
    )
    .setFooter({ text: "Click Accept to start the game" })
    .setTimestamp();

  const buttons = await pluginAPI.gameService.createTicTacToeInviteButtons(challenger.id, opponent.id);

  await interaction.editReply({ embeds: [inviteEmbed], components: [buttons] });
}
