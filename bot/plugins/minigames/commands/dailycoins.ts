/**
 * /dailycoins — Claim your daily Heimdall Coins
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinigamesPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder().setName("dailycoins").setDescription("Claim your daily Heimdall Coins");

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

  const result = await pluginAPI.economyService.claimDaily(interaction.user.id);

  if (result.success) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Daily Reward Claimed!")
      .setDescription(`You received **5** 🪙 Heimdall Coins!\nYour new balance is **${result.balance}** 🪙`)
      .setFooter({ text: "Come back in 24 hours for more coins!" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Daily Reward Not Available")
      .setDescription(`You've already claimed your daily coins!\nCome back in **${result.hoursLeft}h ${result.minutesLeft}m**`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}
