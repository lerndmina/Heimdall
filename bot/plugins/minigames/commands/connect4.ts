/**
 * /connect4 <opponent> — Start a Connect4 game
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";
import Connect4 from "../models/Connect4.js";

export const data = new SlashCommandBuilder()
  .setName("connect4")
  .setDescription("Start a Connect4 game")
  .addUserOption((opt) => opt.setName("opponent").setDescription("The user you want to play against").setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

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
  const existingGame = await Connect4.findOne({
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
    .setTitle("🎮 Connect4 Game Invitation")
    .setDescription(`${challenger} has challenged ${opponent} to a game of Connect4!`)
    .addFields(
      { name: "How to play", value: "Click the buttons below to drop your piece in a column. First to connect 4 wins!" },
      { name: "Challenger", value: `${challenger} (🔴)`, inline: true },
      { name: "Opponent", value: `${opponent} (🟡)`, inline: true },
    )
    .setFooter({ text: "Click Accept to start the game" })
    .setTimestamp();

  const buttons = await pluginAPI.gameService.createConnect4InviteButtons(challenger.id, opponent.id);

  await interaction.editReply({ embeds: [inviteEmbed], components: [buttons] });
}
