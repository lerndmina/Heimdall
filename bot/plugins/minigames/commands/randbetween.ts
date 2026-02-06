/**
 * /randbetween <min> <max> — Generate a random number between two values
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder()
  .setName("randbetween")
  .setDescription("Generate a random number between two values")
  .addIntegerOption((opt) => opt.setName("min").setDescription("Minimum number (inclusive)").setRequired(true))
  .addIntegerOption((opt) => opt.setName("max").setDescription("Maximum number (inclusive)").setRequired(true));

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const min = interaction.options.getInteger("min", true);
  const max = interaction.options.getInteger("max", true);

  if (min > max) {
    await interaction.reply({
      content: "❌ Minimum value cannot be greater than maximum value!",
      ephemeral: true,
    });
    return;
  }

  if (min === max) {
    await interaction.reply({ content: `🎲 The random number is **${min}** (they're the same number!)` });
    return;
  }

  const random = Math.floor(Math.random() * (max - min + 1)) + min;
  await interaction.reply({ content: `🎲 Random number between **${min}** and **${max}**: **${random}**` });
}
