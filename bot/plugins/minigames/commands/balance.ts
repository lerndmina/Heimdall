/**
 * /balance [user] — Check HeimdallCoin balance
 */

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";
import HeimdallCoin from "../models/HeimdallCoin.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your Heimdall Coins balance")
  .addUserOption((opt) => opt.setName("user").setDescription("Check another user's balance (optional)").setRequired(false));

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ flags: ["Ephemeral"] });

  const pluginAPI = getPluginAPI<MinigamesPluginAPI>("minigames");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minigames plugin not loaded.");
    return;
  }

  const targetUser = interaction.options.getUser("user") || interaction.user;

  let userCoins = await HeimdallCoin.findOne({ userId: targetUser.id });
  if (!userCoins) {
    userCoins = await HeimdallCoin.create({ userId: targetUser.id });
  }

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("💰 Heimdall Coins Balance")
    .setDescription(targetUser.id === interaction.user.id ? `Your current balance is: **${userCoins.balance}** 🪙` : `${targetUser.username}'s current balance is: **${userCoins.balance}** 🪙`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields({
      name: "About Heimdall Coins",
      value: "Use Heimdall Coins to play games and bet on various mini-games! You can earn more by winning games or receive 5 coins every 24 hours.",
    })
    .setTimestamp();

  // Ephemeral buttons for daily claim and dice shortcut
  const dailyBtn = pluginAPI.lib.createButtonBuilder(async (i) => {
    const result = await pluginAPI.economyService.claimDaily(i.user.id);
    if (result.success) {
      await i.reply({ content: `✅ You received **5** 🪙 Heimdall Coins!\nYour new balance is **${result.balance}** 🪙`, ephemeral: true });
    } else {
      await i.reply({ content: `❌ You've already claimed your daily coins!\nCome back in **${result.hoursLeft}h ${result.minutesLeft}m**`, ephemeral: true });
    }
  }, 300);
  dailyBtn.setLabel("Claim Daily Coins").setEmoji("💰").setStyle(ButtonStyle.Primary);
  await dailyBtn.ready();

  const diceBtn = pluginAPI.lib.createButtonBuilder(async (i) => {
    await i.deferReply({ ephemeral: true });
    await pluginAPI.economyService.showDiceSelection(i);
  }, 300);
  diceBtn.setLabel("Play Dice").setEmoji("🎲").setStyle(ButtonStyle.Secondary);
  await diceBtn.ready();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(dailyBtn, diceBtn);

  await interaction.editReply({ embeds: [embed], components: [row] });
}
