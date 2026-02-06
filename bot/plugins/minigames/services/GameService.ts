/**
 * GameService — Connect4 and TicTacToe game logic
 *
 * Handles game creation, move processing, and board rendering
 * via ComponentCallbackService persistent handlers.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import Connect4 from "../models/Connect4.js";
import TicTacToe from "../models/TicTacToe.js";
import { checkConnect4Win, isConnect4Draw, getConnect4DropRow, formatConnect4Board, checkTicTacToeWin, isTicTacToeDraw, formatTicTacToeBoard } from "../utils/gameHelpers.js";

const log = createLogger("minigames:game-service");

/** Persistent handler IDs */
export const GameHandlerIds = {
  CONNECT4_ACCEPT: "minigames.connect4.accept",
  CONNECT4_DECLINE: "minigames.connect4.decline",
  CONNECT4_MOVE: "minigames.connect4.move",
  TICTACTOE_ACCEPT: "minigames.tictactoe.accept",
  TICTACTOE_DECLINE: "minigames.tictactoe.decline",
  TICTACTOE_MOVE: "minigames.tictactoe.move",
} as const;

export class GameService {
  private client: HeimdallClient;
  private lib: LibAPI;

  constructor(client: HeimdallClient, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
  }

  /** Register all persistent handlers for game buttons */
  initialize(): void {
    const ccs = this.lib.componentCallbackService;

    // Connect4 handlers
    ccs.registerPersistentHandler(GameHandlerIds.CONNECT4_ACCEPT, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleConnect4Accept(interaction);
    });
    ccs.registerPersistentHandler(GameHandlerIds.CONNECT4_DECLINE, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleConnect4Decline(interaction);
    });
    ccs.registerPersistentHandler(GameHandlerIds.CONNECT4_MOVE, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleConnect4Move(interaction);
    });

    // TicTacToe handlers
    ccs.registerPersistentHandler(GameHandlerIds.TICTACTOE_ACCEPT, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleTicTacToeAccept(interaction);
    });
    ccs.registerPersistentHandler(GameHandlerIds.TICTACTOE_DECLINE, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleTicTacToeDecline(interaction);
    });
    ccs.registerPersistentHandler(GameHandlerIds.TICTACTOE_MOVE, async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleTicTacToeMove(interaction);
    });

    log.info("Game persistent handlers registered");
  }

  // ── Connect4 Invitation Buttons ─────────────────────

  /** Create accept/decline buttons for a Connect4 invitation */
  async createConnect4InviteButtons(challengerId: string, opponentId: string): Promise<ActionRowBuilder<ButtonBuilder>> {
    const ccs = this.lib.componentCallbackService;

    const acceptId = await ccs.createPersistentComponent(GameHandlerIds.CONNECT4_ACCEPT, "button", { challengerId, opponentId });
    const declineId = await ccs.createPersistentComponent(GameHandlerIds.CONNECT4_DECLINE, "button", { challengerId, opponentId });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel("Accept").setStyle(ButtonStyle.Success).setEmoji("✅"),
      new ButtonBuilder().setCustomId(declineId).setLabel("Decline").setStyle(ButtonStyle.Danger).setEmoji("❌"),
    );

    return row;
  }

  /** Create column buttons for an active Connect4 game */
  private async createConnect4MoveButtons(messageId: string, board: (string | null)[][]): Promise<ActionRowBuilder<ButtonBuilder>> {
    const ccs = this.lib.componentCallbackService;
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];

    const buttons: ButtonBuilder[] = [];
    for (let i = 0; i < 7; i++) {
      const isFull = getConnect4DropRow(board, i) === -1;
      const customId = await ccs.createPersistentComponent(GameHandlerIds.CONNECT4_MOVE, "button", { messageId, col: i });
      buttons.push(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(`${i + 1}`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(emojis[i]!)
          .setDisabled(isFull),
      );
    }

    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  }

  // ── Connect4 Handlers ──────────────────────────────

  private async handleConnect4Accept(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { challengerId, opponentId } = metadata as { challengerId: string; opponentId: string };

    if (interaction.user.id !== opponentId) {
      await interaction.reply({ content: "❌ Only the challenged player can accept this game!", ephemeral: true });
      return;
    }

    // Check for existing game
    const existingGame = await Connect4.findOne({ messageId: interaction.message.id });
    if (existingGame) {
      await interaction.reply({ content: "❌ This game has already been accepted!", ephemeral: true });
      return;
    }

    // Create game
    const board: (string | null)[][] = Array(6)
      .fill(null)
      .map(() => Array(7).fill(null) as (string | null)[]);

    await Connect4.create({
      messageId: interaction.message.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId!,
      player1: challengerId,
      player2: opponentId,
      currentTurn: challengerId,
      board,
      gameOver: false,
    });

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🎮 Connect4 Game")
      .setDescription(`${formatConnect4Board(board, challengerId, opponentId)}\n\n` + `**Current Turn:** <@${challengerId}> (🔴)\n` + `**Players:** <@${challengerId}> (🔴) vs <@${opponentId}> (🟡)`)
      .setFooter({ text: "Click a column button to drop your piece" })
      .setTimestamp();

    const moveButtons = await this.createConnect4MoveButtons(interaction.message.id, board);

    await interaction.update({ embeds: [embed], components: [moveButtons] });
    log.info(`Connect4 game started: ${challengerId} vs ${opponentId}`);
  }

  private async handleConnect4Decline(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { opponentId } = metadata as { challengerId: string; opponentId: string };

    if (interaction.user.id !== opponentId) {
      await interaction.reply({ content: "❌ Only the challenged player can decline this game!", ephemeral: true });
      return;
    }

    const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("🎮 Connect4 Game Declined").setDescription(`<@${opponentId}> has declined the game invitation.`).setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
  }

  private async handleConnect4Move(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { messageId, col } = metadata as { messageId: string; col: number };

    if (isNaN(col) || col < 0 || col >= 7) {
      await interaction.reply({ content: "❌ Invalid column!", ephemeral: true });
      return;
    }

    try {
      const game = await Connect4.findOne({ messageId });
      if (!game) {
        await interaction.reply({ content: "❌ Game not found!", ephemeral: true });
        return;
      }
      if (game.gameOver) {
        await interaction.reply({ content: "❌ This game has already ended!", ephemeral: true });
        return;
      }
      if (game.currentTurn !== interaction.user.id) {
        await interaction.reply({ content: "❌ It's not your turn!", ephemeral: true });
        return;
      }
      if (interaction.user.id !== game.player1 && interaction.user.id !== game.player2) {
        await interaction.reply({ content: "❌ You are not a player in this game!", ephemeral: true });
        return;
      }

      const board = game.board as unknown as (string | null)[][];
      const dropRow = getConnect4DropRow(board, col);
      if (dropRow === -1) {
        await interaction.reply({ content: "❌ That column is full!", ephemeral: true });
        return;
      }

      board[dropRow]![col] = interaction.user.id;

      const winner = checkConnect4Win(board);
      const isDraw = !winner && isConnect4Draw(board);

      if (winner || isDraw) {
        await Connect4.updateOne(
          { messageId },
          {
            board,
            gameOver: true,
            winner: winner || undefined,
            isDraw: isDraw || undefined,
          },
        );

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(winner ? 0x00ff00 : 0xffaa00)
          .setTitle("🎮 Connect4 Game — Game Over!")
          .setDescription(
            `${formatConnect4Board(board, game.player1, game.player2)}\n\n` +
              (winner ? `**Winner:** <@${winner}> 🎉` : "**Result:** Draw! The board is full.") +
              `\n**Players:** <@${game.player1}> (🔴) vs <@${game.player2}> (🟡)`,
          )
          .setFooter({ text: "Thanks for playing!" })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        log.info(`Connect4 game ended: ${messageId} — ${winner ? `Winner: ${winner}` : "Draw"}`);
      } else {
        const nextTurn = game.currentTurn === game.player1 ? game.player2 : game.player1;

        await Connect4.updateOne({ messageId }, { board, currentTurn: nextTurn });

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎮 Connect4 Game")
          .setDescription(
            `${formatConnect4Board(board, game.player1, game.player2)}\n\n` +
              `**Current Turn:** <@${nextTurn}> ${nextTurn === game.player1 ? "(🔴)" : "(🟡)"}\n` +
              `**Players:** <@${game.player1}> (🔴) vs <@${game.player2}> (🟡)`,
          )
          .setFooter({ text: "Click a column button to drop your piece" })
          .setTimestamp();

        const moveButtons = await this.createConnect4MoveButtons(messageId, board);
        await interaction.update({ embeds: [embed], components: [moveButtons] });
      }
    } catch (error) {
      log.error("Error handling Connect4 move:", error);
      await interaction.reply({ content: "❌ An error occurred while processing your move.", ephemeral: true });
    }
  }

  // ── TicTacToe Invitation Buttons ────────────────────

  /** Create accept/decline buttons for a TicTacToe invitation */
  async createTicTacToeInviteButtons(challengerId: string, opponentId: string): Promise<ActionRowBuilder<ButtonBuilder>> {
    const ccs = this.lib.componentCallbackService;

    const acceptId = await ccs.createPersistentComponent(GameHandlerIds.TICTACTOE_ACCEPT, "button", { challengerId, opponentId });
    const declineId = await ccs.createPersistentComponent(GameHandlerIds.TICTACTOE_DECLINE, "button", { challengerId, opponentId });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel("Accept").setStyle(ButtonStyle.Success).setEmoji("✅"),
      new ButtonBuilder().setCustomId(declineId).setLabel("Decline").setStyle(ButtonStyle.Danger).setEmoji("❌"),
    );

    return row;
  }

  /** Create 3×3 button grid for an active TicTacToe game */
  private async createTicTacToeGrid(messageId: string, board: (string | null)[], player1: string, player2: string): Promise<ActionRowBuilder<ButtonBuilder>[]> {
    const ccs = this.lib.componentCallbackService;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let r = 0; r < 3; r++) {
      const buttons: ButtonBuilder[] = [];
      for (let c = 0; c < 3; c++) {
        const pos = r * 3 + c;
        const cell = board[pos];
        const isUsed = cell !== null;

        const emoji = cell === player1 ? "❌" : cell === player2 ? "⭕" : "➖";
        const customId = await ccs.createPersistentComponent(GameHandlerIds.TICTACTOE_MOVE, "button", { messageId, position: pos });

        buttons.push(
          new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(emoji)
            .setStyle(isUsed ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(isUsed),
        );
      }
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
    }

    return rows;
  }

  // ── TicTacToe Handlers ─────────────────────────────

  private async handleTicTacToeAccept(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { challengerId, opponentId } = metadata as { challengerId: string; opponentId: string };

    if (interaction.user.id !== opponentId) {
      await interaction.reply({ content: "❌ Only the challenged player can accept this game!", ephemeral: true });
      return;
    }

    const existingGame = await TicTacToe.findOne({ messageId: interaction.message.id });
    if (existingGame) {
      await interaction.reply({ content: "❌ This game has already been accepted!", ephemeral: true });
      return;
    }

    const board: (string | null)[] = Array(9).fill(null) as (string | null)[];

    await TicTacToe.create({
      messageId: interaction.message.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId!,
      player1: challengerId,
      player2: opponentId,
      currentTurn: challengerId,
      board,
      gameOver: false,
    });

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🎮 Tic-Tac-Toe Game")
      .setDescription(`${formatTicTacToeBoard(board, challengerId, opponentId)}\n\n` + `**Current Turn:** <@${challengerId}> (❌)\n` + `**Players:** <@${challengerId}> (❌) vs <@${opponentId}> (⭕)`)
      .setFooter({ text: "Click a button to place your mark" })
      .setTimestamp();

    const grid = await this.createTicTacToeGrid(interaction.message.id, board, challengerId, opponentId);
    await interaction.update({ embeds: [embed], components: grid });
    log.info(`TicTacToe game started: ${challengerId} vs ${opponentId}`);
  }

  private async handleTicTacToeDecline(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { opponentId } = metadata as { challengerId: string; opponentId: string };

    if (interaction.user.id !== opponentId) {
      await interaction.reply({ content: "❌ Only the challenged player can decline this game!", ephemeral: true });
      return;
    }

    const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("🎮 Tic-Tac-Toe Game Declined").setDescription(`<@${opponentId}> has declined the game invitation.`).setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
  }

  private async handleTicTacToeMove(interaction: ButtonInteraction): Promise<void> {
    const metadata = await this.lib.componentCallbackService.getPersistentComponentMetadata(interaction.customId);
    if (!metadata) return;

    const { messageId, position } = metadata as { messageId: string; position: number };

    if (isNaN(position) || position < 0 || position >= 9) {
      await interaction.reply({ content: "❌ Invalid position!", ephemeral: true });
      return;
    }

    try {
      const game = await TicTacToe.findOne({ messageId });
      if (!game) {
        await interaction.reply({ content: "❌ Game not found!", ephemeral: true });
        return;
      }
      if (game.gameOver) {
        await interaction.reply({ content: "❌ This game has already ended!", ephemeral: true });
        return;
      }
      if (game.currentTurn !== interaction.user.id) {
        await interaction.reply({ content: "❌ It's not your turn!", ephemeral: true });
        return;
      }
      if (interaction.user.id !== game.player1 && interaction.user.id !== game.player2) {
        await interaction.reply({ content: "❌ You are not a player in this game!", ephemeral: true });
        return;
      }

      const board = game.board as unknown as (string | null)[];
      if (board[position] !== null) {
        await interaction.reply({ content: "❌ That position is already taken!", ephemeral: true });
        return;
      }

      board[position] = interaction.user.id;

      const winner = checkTicTacToeWin(board);
      const isDraw = !winner && isTicTacToeDraw(board);

      if (winner || isDraw) {
        await TicTacToe.updateOne(
          { messageId },
          {
            board,
            gameOver: true,
            winner: winner || undefined,
            isDraw: isDraw || undefined,
          },
        );

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(winner ? 0x00ff00 : 0xffaa00)
          .setTitle("🎮 Tic-Tac-Toe — Game Over!")
          .setDescription(
            `${formatTicTacToeBoard(board, game.player1, game.player2)}\n\n` +
              (winner ? `**Winner:** <@${winner}> 🎉` : "**Result:** Draw!") +
              `\n**Players:** <@${game.player1}> (❌) vs <@${game.player2}> (⭕)`,
          )
          .setFooter({ text: "Thanks for playing!" })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        log.info(`TicTacToe game ended: ${messageId} — ${winner ? `Winner: ${winner}` : "Draw"}`);
      } else {
        const nextTurn = game.currentTurn === game.player1 ? game.player2 : game.player1;
        await TicTacToe.updateOne({ messageId }, { board, currentTurn: nextTurn });

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🎮 Tic-Tac-Toe Game")
          .setDescription(
            `${formatTicTacToeBoard(board, game.player1, game.player2)}\n\n` +
              `**Current Turn:** <@${nextTurn}> ${nextTurn === game.player1 ? "(❌)" : "(⭕)"}\n` +
              `**Players:** <@${game.player1}> (❌) vs <@${game.player2}> (⭕)`,
          )
          .setFooter({ text: "Click a button to place your mark" })
          .setTimestamp();

        const grid = await this.createTicTacToeGrid(messageId, board, game.player1, game.player2);
        await interaction.update({ embeds: [embed], components: grid });
      }
    } catch (error) {
      log.error("Error handling TicTacToe move:", error);
      await interaction.reply({ content: "❌ An error occurred while processing your move.", ephemeral: true });
    }
  }

  // ── Admin Helpers ───────────────────────────────────

  /** Force-end a Connect4 game (for game-admin) */
  async forceEndConnect4(messageId: string): Promise<boolean> {
    const result = await Connect4.updateOne({ messageId }, { gameOver: true });
    return result.modifiedCount > 0;
  }

  /** Force-end a TicTacToe game (for game-admin) */
  async forceEndTicTacToe(messageId: string): Promise<boolean> {
    const result = await TicTacToe.updateOne({ messageId }, { gameOver: true });
    return result.modifiedCount > 0;
  }

  /** Set winner for a Connect4 game */
  async setConnect4Winner(messageId: string, winnerId: string): Promise<boolean> {
    const result = await Connect4.updateOne({ messageId }, { gameOver: true, winner: winnerId });
    return result.modifiedCount > 0;
  }

  /** Set winner for a TicTacToe game */
  async setTicTacToeWinner(messageId: string, winnerId: string): Promise<boolean> {
    const result = await TicTacToe.updateOne({ messageId }, { gameOver: true, winner: winnerId });
    return result.modifiedCount > 0;
  }

  /** Force draw for a Connect4 game */
  async setConnect4Draw(messageId: string): Promise<boolean> {
    const result = await Connect4.updateOne({ messageId }, { gameOver: true, isDraw: true });
    return result.modifiedCount > 0;
  }

  /** Force draw for a TicTacToe game */
  async setTicTacToeDraw(messageId: string): Promise<boolean> {
    const result = await TicTacToe.updateOne({ messageId }, { gameOver: true, isDraw: true });
    return result.modifiedCount > 0;
  }
}
