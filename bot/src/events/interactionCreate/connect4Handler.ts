import {
  BaseInteraction,
  ChannelType,
  Client,
  InteractionType,
  Message,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
} from "../../commands/fun/connect4";
import { debugMsg } from "../../utils/TinyUtils";
import FetchEnvs from "../../utils/FetchEnvs";
import { ButtonKit } from "@heimdall/command-handler";

const db = new Database();
const env = FetchEnvs();

export default async (
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  client: Client<true>
) => {
  if (!interaction.channel || !interaction.channel.isTextBased()) return;
  if (!interaction.guild) return;

  // Handle button interactions (Make Move button)
  if (interaction.type === InteractionType.MessageComponent) {
    if (!interaction.customId.startsWith("connect4_move_")) return;

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

    // Show modal for column selection
    const modal = new ModalBuilder()
      .setCustomId(`connect4_modal_${game.messageId}`)
      .setTitle("Choose Your Column")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("column")
            .setLabel(`Column (1-${game.width})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Enter column number (1-${game.width})`)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(2)
        )
      );

    await interaction.showModal(modal);
  }

  // Handle modal submissions (Column selection)
  if (interaction.type === InteractionType.ModalSubmit) {
    if (!interaction.customId.startsWith("connect4_modal_")) return;

    const gameMessageId = interaction.customId.split("_")[2];
    let game = (await db.findOne(Connect4Schema, {
      messageId: gameMessageId,
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

    const columnInput = interaction.fields.getTextInputValue("column").trim();

    // Enhanced validation
    if (!columnInput) {
      return interaction.reply({
        content: "Please enter a column number.",
        ephemeral: true,
      });
    }

    const column = parseInt(columnInput) - 1; // Convert to 0-indexed

    // Validate column is a number
    if (isNaN(column)) {
      return interaction.reply({
        content: `"${columnInput}" is not a valid number. Please enter a column number between 1 and ${game.width}.`,
        ephemeral: true,
      });
    }

    // Validate column is in range
    if (column < 0 || column >= game.width) {
      return interaction.reply({
        content: `Column ${columnInput} is out of range! Please choose a number between 1 and ${game.width}.`,
        ephemeral: true,
      });
    }

    // Check if column is full
    const lowestRow = findLowestAvailableRow(game.gameState, column, game.height);
    if (lowestRow === null) {
      return interaction.reply({
        content: `Column ${column + 1} is full! Choose another column.`,
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

    // Get the message and update it
    const message = await interaction.channel!.messages.fetch(game.messageId);

    const makeMoveButton = new ButtonKit()
      .setEmoji("🎯")
      .setLabel("Make Move")
      .setStyle(1) // Primary style
      .setCustomId(`connect4_move_${game.messageId}`);

    const makeMoveRow = new ActionRowBuilder<ButtonKit>().addComponents(makeMoveButton);

    await message.edit({
      components: [makeMoveRow],
      embeds: [getConnect4Embed(game, client)],
    });

    await interaction.reply({
      content: `You placed your piece in column ${column + 1}!`,
      ephemeral: true,
    });

    debugGameState(game);
  }
};

async function endGame(
  game: Connect4SchemaType,
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  client: Client<true>,
  winner: string | null
) {
  game.gameOver = true;

  // Get the message
  const message = await interaction.channel!.messages.fetch(game.messageId);

  // Create disabled button
  const disabledButton = new ButtonKit()
    .setEmoji("🎯")
    .setLabel("Game Over")
    .setStyle(2) // Secondary style
    .setCustomId(`connect4_move_${game.messageId}`)
    .setDisabled(true);

  const disabledRow = new ActionRowBuilder<ButtonKit>().addComponents(disabledButton);

  if (winner) {
    const winnerId = winner === C4_RED ? game.initiatorId : game.opponentId;
    const looserId = winnerId === game.initiatorId ? game.opponentId : game.initiatorId;
    const embed = getConnect4Embed(game, client, false, { winnerId, looserId });

    await message.edit({
      content: "",
      embeds: [embed],
      components: [disabledRow],
    });

    await interaction.reply({
      content: `Congratulations! You won the game!`,
      ephemeral: true,
    });
  } else {
    await message.edit({
      content: ``,
      embeds: [getConnect4Embed(game, client, true)],
      components: [disabledRow],
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
