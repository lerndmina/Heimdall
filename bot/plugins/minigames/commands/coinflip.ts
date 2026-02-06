/**
 * /coinflip — Flip a coin!
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin!");

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply();

  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  const emoji = result === "Heads" ? "🪙" : "🎲";

  await interaction.editReply(`${emoji} The coin landed on **${result}**!`);
}
