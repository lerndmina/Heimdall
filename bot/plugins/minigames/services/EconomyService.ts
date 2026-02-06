/**
 * EconomyService — HeimdallCoin balance management, daily claims, and dice game
 *
 * Uses ephemeral ComponentCallbackService buttons (TTL-based) for the dice game flow.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { nanoid } from "nanoid";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import HeimdallCoin from "../models/HeimdallCoin.js";

const log = createLogger("minigames:economy");

/** Daily coin reward amount */
export const DAILY_AMOUNT = 5;
/** Daily cooldown in ms (24 hours) */
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Dice type definitions */
export const DICE_TYPES = {
  d6: { sides: 6, minBet: 10 },
  d8: { sides: 8, minBet: 15 },
  d10: { sides: 10, minBet: 20 },
  d12: { sides: 12, minBet: 25 },
  d20: { sides: 20, minBet: 30 },
} as const;

export type DiceType = keyof typeof DICE_TYPES;

/** In-memory dice game state per user */
interface DiceGameState {
  selectedDice?: DiceType;
  selectedNumber?: number;
  betAmount?: number;
}

/** TTL for dice game buttons (5 minutes) */
const DICE_TTL = 300;

export class EconomyService {
  private lib: LibAPI;
  /** In-memory dice state per user */
  private gameStates = new Map<string, DiceGameState>();

  constructor(lib: LibAPI) {
    this.lib = lib;
  }

  // ── Daily Coins ─────────────────────────────────────

  /** Claim daily coins. Returns { success, balance, timeLeft? } */
  async claimDaily(userId: string): Promise<{ success: boolean; balance: number; hoursLeft?: number; minutesLeft?: number }> {
    let userCoins = await HeimdallCoin.findOne({ userId });
    if (!userCoins) {
      userCoins = await HeimdallCoin.create({ userId });
    }

    const now = new Date();
    const lastDaily = userCoins.lastDaily;

    if (lastDaily && now.getTime() - lastDaily.getTime() < DAILY_COOLDOWN_MS) {
      const timeLeft = DAILY_COOLDOWN_MS - (now.getTime() - lastDaily.getTime());
      return {
        success: false,
        balance: userCoins.balance,
        hoursLeft: Math.floor(timeLeft / (60 * 60 * 1000)),
        minutesLeft: Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000)),
      };
    }

    userCoins.balance += DAILY_AMOUNT;
    userCoins.lastDaily = now;
    await userCoins.save();

    return { success: true, balance: userCoins.balance };
  }

  // ── Dice Game Flow ──────────────────────────────────

  /** Show the initial dice type selection (for /dice command or "Play Again") */
  async showDiceSelection(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    this.gameStates.set(userId, {});

    const row = new ActionRowBuilder<ButtonBuilder>();

    for (const [type, data] of Object.entries(DICE_TYPES)) {
      const button = this.lib.createButtonBuilder(async (btnInteraction) => {
        await this.handleDiceTypeSelect(btnInteraction, type as DiceType);
      }, DICE_TTL);
      button.setLabel(`${type} (${data.sides}-sided)`).setStyle(ButtonStyle.Primary);
      await button.ready();
      row.addComponents(button);
    }

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎲 Choose Your Dice")
      .setDescription(
        "Select a dice type to start playing!\n\n" +
          Object.entries(DICE_TYPES)
            .map(([type, data]) => `**${type}**: ${data.sides} sides, min bet: ${data.minBet} 🪙`)
            .join("\n"),
      )
      .setFooter({ text: "Higher sided dice = higher potential winnings!" });

    const payload = { embeds: [embed], components: [row] };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else if (interaction.isButton()) {
      await interaction.update(payload);
    } else {
      await interaction.reply(payload);
    }
  }

  /** Handle dice type selection */
  private async handleDiceTypeSelect(interaction: ButtonInteraction, diceType: DiceType): Promise<void> {
    const userId = interaction.user.id;
    const state: DiceGameState = {
      selectedDice: diceType,
      selectedNumber: undefined,
      betAmount: DICE_TYPES[diceType].minBet,
    };
    this.gameStates.set(userId, state);

    await this.showNumberSelection(interaction, diceType);
  }

  /** Show number selection buttons */
  private async showNumberSelection(interaction: ButtonInteraction, diceType: DiceType): Promise<void> {
    const maxNumber = DICE_TYPES[diceType].sides;
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < maxNumber; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (let j = i + 1; j <= Math.min(i + 5, maxNumber); j++) {
        const num = j;
        const button = this.lib.createButtonBuilder(async (btnInteraction) => {
          await this.handleNumberSelect(btnInteraction, num);
        }, DICE_TTL);
        button.setLabel(num.toString()).setStyle(ButtonStyle.Secondary);
        await button.ready();
        row.addComponents(button);
      }
      rows.push(row);
    }

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎲 Pick Your Lucky Number")
      .setDescription(`You selected a ${diceType} (${DICE_TYPES[diceType].sides}-sided die).\nNow pick a number to bet on!`);

    await interaction.update({ embeds: [embed], components: rows });
  }

  /** Handle number selection */
  private async handleNumberSelect(interaction: ButtonInteraction, number: number): Promise<void> {
    const userId = interaction.user.id;
    const state = this.gameStates.get(userId);
    if (!state?.selectedDice) {
      await interaction.reply({ content: "❌ Something went wrong. Please try the command again with /dice", ephemeral: true });
      return;
    }
    state.selectedNumber = number;
    this.gameStates.set(userId, state);
    await this.showBetSelection(interaction, state);
  }

  /** Show bet control buttons */
  private async showBetSelection(interaction: ButtonInteraction | ModalSubmitInteraction, state: DiceGameState): Promise<void> {
    const minBet = DICE_TYPES[state.selectedDice!].minBet;

    const minus10 = this.lib.createButtonBuilder(async (i) => this.handleBetAdjust(i, -10), DICE_TTL);
    minus10.setLabel("-10").setStyle(ButtonStyle.Secondary);
    await minus10.ready();

    const plus10 = this.lib.createButtonBuilder(async (i) => this.handleBetAdjust(i, 10), DICE_TTL);
    plus10.setLabel("+10").setStyle(ButtonStyle.Secondary);
    await plus10.ready();

    const customBet = this.lib.createButtonBuilder(async (i) => this.handleCustomBetModal(i), DICE_TTL);
    customBet.setLabel("Custom Bet").setStyle(ButtonStyle.Primary);
    await customBet.ready();

    const rollBtn = this.lib.createButtonBuilder(async (i) => this.handleRoll(i), DICE_TTL);
    rollBtn.setLabel("Roll Dice!").setStyle(ButtonStyle.Success);
    await rollBtn.ready();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(minus10, plus10, customBet, rollBtn);

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("💰 Place Your Bet")
      .setDescription(`Selected: ${state.selectedDice}, Number: ${state.selectedNumber}\n` + `Current Bet: ${state.betAmount || minBet} 🪙\n` + `Minimum Bet: ${minBet} 🪙`);

    const payload = { embeds: [embed], components: [row] };

    if (interaction.isButton()) {
      await interaction.update(payload);
    } else if (interaction.isModalSubmit()) {
      await interaction.editReply(payload);
    }
  }

  /** Adjust bet by delta */
  private async handleBetAdjust(interaction: ButtonInteraction, delta: number): Promise<void> {
    const userId = interaction.user.id;
    const state = this.gameStates.get(userId);
    if (!state?.selectedDice || !state.selectedNumber) {
      await interaction.reply({ content: "❌ Please select a dice type and number first!", ephemeral: true });
      return;
    }

    const minBet = DICE_TYPES[state.selectedDice].minBet;

    if (delta > 0) {
      const userCoins = await HeimdallCoin.findOne({ userId });
      const maxBet = userCoins?.balance || 0;
      state.betAmount = Math.min((state.betAmount || 0) + delta, maxBet);
    } else {
      state.betAmount = Math.max((state.betAmount || minBet) + delta, minBet);
    }

    this.gameStates.set(userId, state);
    await this.showBetSelection(interaction, state);
  }

  /** Show custom bet modal */
  private async handleCustomBetModal(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const state = this.gameStates.get(userId);
    if (!state?.selectedDice || !state.selectedNumber) {
      await interaction.reply({ content: "❌ Please select a dice type and number first!", ephemeral: true });
      return;
    }

    const userCoins = await HeimdallCoin.findOne({ userId });
    const maxBet = userCoins?.balance || 0;
    const minBet = DICE_TYPES[state.selectedDice].minBet;

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Place Custom Bet");

    const betInput = new TextInputBuilder()
      .setCustomId("bet_amount")
      .setLabel(`Enter bet amount (${minBet}-${maxBet} coins)`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(10)
      .setPlaceholder(minBet.toString())
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(betInput));
    await interaction.showModal(modal);

    try {
      const modalSubmit = await interaction.awaitModalSubmit({
        filter: (i) => i.user.id === userId && i.customId === modalId,
        time: 900_000,
      });

      const betAmountStr = modalSubmit.fields.getTextInputValue("bet_amount");
      const betAmount = parseInt(betAmountStr, 10);

      if (isNaN(betAmount)) {
        await modalSubmit.reply({ content: "❌ Please enter a valid number.", ephemeral: true });
        return;
      }

      if (betAmount < minBet || betAmount > maxBet) {
        await modalSubmit.reply({ content: `❌ Bet must be between ${minBet} and ${maxBet} coins.`, ephemeral: true });
        return;
      }

      state.betAmount = betAmount;
      this.gameStates.set(userId, state);

      await modalSubmit.deferUpdate();
      await this.showBetSelection(modalSubmit, state);
    } catch {
      // Modal timed out — silently ignore
    }
  }

  /** Roll the dice and show results */
  private async handleRoll(interaction: ButtonInteraction): Promise<void> {
    const userId = interaction.user.id;
    const state = this.gameStates.get(userId);

    if (!state?.selectedDice || !state.selectedNumber || !state.betAmount) {
      await interaction.reply({ content: "❌ Please select a dice type, number, and bet amount first!", ephemeral: true });
      return;
    }

    let userCoins = await HeimdallCoin.findOne({ userId });
    if (!userCoins) {
      await interaction.reply({ content: "❌ You don't have any Heimdall Coins! Use /dailycoins to get started.", ephemeral: true });
      return;
    }

    if (userCoins.balance < state.betAmount) {
      await interaction.reply({ content: `❌ You don't have enough Heimdall Coins! Your balance: ${userCoins.balance} 🪙`, ephemeral: true });
      return;
    }

    // Roll
    const roll = Math.floor(Math.random() * DICE_TYPES[state.selectedDice].sides) + 1;
    const won = roll === state.selectedNumber;
    const multiplier = DICE_TYPES[state.selectedDice].sides - 1;

    userCoins.balance -= state.betAmount;
    if (won) {
      userCoins.balance += state.betAmount * multiplier;
    }
    await userCoins.save();

    const embed = this.lib
      .createEmbedBuilder()
      .setColor(won ? 0x00ff00 : 0xff0000)
      .setTitle("🎲 Dice Roll Result")
      .setDescription(won ? "🎉 **WINNER!** The dice landed on your number!" : "😔 Better luck next time! The dice didn't land on your number.")
      .addFields(
        { name: "Dice Type", value: `${DICE_TYPES[state.selectedDice].sides}-sided (${state.selectedDice})`, inline: true },
        { name: "Your Number", value: state.selectedNumber.toString(), inline: true },
        { name: "Rolled", value: roll.toString(), inline: true },
        { name: "Bet Amount", value: `${state.betAmount} 🪙`, inline: true },
        { name: won ? "Won" : "Lost", value: won ? `${state.betAmount * multiplier} 🪙` : `${state.betAmount} 🪙`, inline: true },
        { name: "New Balance", value: `${userCoins.balance} 🪙`, inline: true },
      );

    const playAgain = this.lib.createButtonBuilder(async (i) => {
      await this.showDiceSelection(i);
    }, DICE_TTL);
    playAgain.setLabel("Play Again").setStyle(ButtonStyle.Primary);
    await playAgain.ready();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(playAgain);
    await interaction.update({ embeds: [embed], components: [row] });
  }
}
