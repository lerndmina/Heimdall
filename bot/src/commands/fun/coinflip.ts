import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder } from "discord.js";
import log from "../../utils/log";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("Flip a coin to get heads or tails.")
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const coin = Math.random() > 0.5 ? "Heads" : "Tails";
  interaction.reply({ content: coin });
}
