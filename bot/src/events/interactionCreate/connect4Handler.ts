import {
  BaseInteraction,
  ChannelType,
  Client,
  InteractionType,
  Message,
  MessageComponentInteraction,
  ActionRowBuilder,
} from "discord.js";
import Database from "../../utils/data/database";
import Connect4Schema, { Connect4SchemaType } from "../../models/Connect4Schema";
import {
  C4_BLANK,
  C4_RED,
  C4_BLUE,
  getConnect4Embed,
  findLowestAvailableRow,
  checkConnect4Win,
  checkConnect4Draw,
  getColumnButtons,
} from "../../commands/fun/connect4";
import { debugMsg } from "../../utils/TinyUtils";
import FetchEnvs from "../../utils/FetchEnvs";
import { ButtonKit } from "@heimdall/command-handler";

const db = new Database();
const env = FetchEnvs();

export default async (interaction: MessageComponentInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.channel || !interaction.channel.isTextBased()) return;
  if (!interaction.guild) return;
  if (!interaction.customId.startsWith("connect4_column_")) return;

  const message = await interaction.channel.messages.fetch(interaction.message.id);
  if (!message) {
    return interaction.reply({ content: "The message was not found.", ephemeral: true });
  }

  let game = (await db.findOne(Connect4Schema, {
    messageId: interaction.message.id,
  })) as Connect4SchemaType;

  if (!game) {
    return interaction.reply({ content: "The game was not found.", ephemeral: true });
  }

  if (interaction.user.id !== game.initiatorId && interaction.user.id !== game.opponentId) {
    return interaction.reply({ content: "You are not part of this game.", ephemeral: true });
  }

  if (game.gameOver) {
    return interaction.reply({ content: "The game is already over.", ephemeral: true });
  }

  if (game.turn !== interaction.user.id) {
    return interaction.reply({ content: "It's not your turn.", ephemeral: true });
  }

  // Extract column from customId: connect4_column_{col}_{gameId}
  const column = parseInt(interaction.customId.split("_")[2]);

  // Validate column
  if (isNaN(column) || column < 0 || column >= game.width) {
    return interaction.reply({
      content: `Invalid column! Please choose a valid column.`,
      ephemeral: true,
    });
  }

  // Check if column is full
  const lowestRow = findLowestAvailableRow(game.gameState, column, game.height);
  if (lowestRow === null) {
    return interaction.reply({
      content: "That column is full! Choose another column.",
      ephemeral: true,
    });
  }

  // Place piece
  const piece = game.turn === game.initiatorId ? C4_RED : C4_BLUE;
  game.gameState[`${lowestRow}${column}`] = piece;

  // Check for win
  const winner = checkConnect4Win(game.gameState, lowestRow, column, game.width, game.height);
  if (winner) {
    await endGame(game, interaction, client, winner);
    return;
  }

  // Check for draw
  if (checkConnect4Draw(game)) {
    await endGame(game, interaction, client, null);
    return;
  }

  // Switch turns
  game.turn = game.turn === game.initiatorId ? game.opponentId : game.initiatorId;

  // Update database
  await db.findOneAndUpdate(Connect4Schema, { messageId: game.messageId }, game);

  // Update the message with new board state
  const columnButtons = getColumnButtons(game.width, interaction.customId.split("_")[3]);

  await message.edit({
    components: columnButtons,
    embeds: [getConnect4Embed(game, client)],
  });

  await interaction.reply({
    content: `You placed your piece in column ${column + 1}!`,
    ephemeral: true,
  });

  debugGameState(game);
};

async function endGame(
  game: Connect4SchemaType,
  interaction: MessageComponentInteraction,
  client: Client<true>,
  winner: string | null
) {
  game.gameOver = true;

  // Get the message
  const message = await interaction.channel!.messages.fetch(game.messageId);

  // Create disabled column buttons
  const disabledButtons = getColumnButtons(game.width, interaction.customId.split("_")[3], true);

  if (winner) {
    const winnerId = winner === C4_RED ? game.initiatorId : game.opponentId;
    const looserId = winnerId === game.initiatorId ? game.opponentId : game.initiatorId;
    const embed = getConnect4Embed(game, client, false, { winnerId, looserId });

    await message.edit({
      content: "",
      embeds: [embed],
      components: disabledButtons,
    });

    await interaction.reply({
      content: `Congratulations! You won the game!`,
      ephemeral: true,
    });
  } else {
    await message.edit({
      content: ``,
      embeds: [getConnect4Embed(game, client, true)],
      components: disabledButtons,
    });

    await interaction.reply({
      content: `The game ended in a draw!`,
      ephemeral: true,
    });
  }

  // Update database and clean cache
  await db.findOneAndUpdate(Connect4Schema, { messageId: game.messageId }, game);
  db.cleanCache(`${env.MONGODB_DATABASE}:${Connect4Schema.name}:messageId:${game.messageId}`);
}

function debugGameState(game: Connect4SchemaType) {
  if (!env.DEBUG_LOG) return;

  const board = Array.from({ length: game.height }, () => Array(game.width).fill("⬜"));
  for (let [key, value] of Object.entries(game.gameState)) {
    const row = parseInt(key[0], 10);
    const col = parseInt(key[1], 10);
    if (value === C4_BLANK) value = "_";
    board[row][col] = value;
  }

  console.log("Connect 4 Board State:");
  // Print each row of the board (top to bottom for readability)
  for (let row = game.height - 1; row >= 0; row--) {
    console.log(board[row].join(" "));
  }
  console.log("---");
}
