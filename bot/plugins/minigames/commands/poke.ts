/**
 * /poke <user> [message] — Poke a user to get their attention
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder()
  .setName("poke")
  .setDescription("Poke a user to get their attention")
  .addUserOption((opt) => opt.setName("user").setDescription("User to poke").setRequired(true))
  .addStringOption((opt) => opt.setName("message").setDescription("Optional message to include").setRequired(false));

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;
  const user = interaction.options.getUser("user", true);
  const message = interaction.options.getString("message");

  if (user.id === interaction.user.id) {
    await interaction.reply({ content: "❌ You can't poke yourself!", ephemeral: true });
    return;
  }

  if (user.bot) {
    await interaction.reply({ content: "❌ You can't poke bots!", ephemeral: true });
    return;
  }

  const baseMessage = `👉 ${user}, you've been poked by ${interaction.user}!`;
  const fullMessage = message ? `${baseMessage}\n💬 *"${message}"*` : baseMessage;

  await interaction.reply(fullMessage);
}
