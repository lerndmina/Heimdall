/**
 * /therules — Link to therules.fyi
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder().setName("therules").setDescription("See the server rules");

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction } = context;

  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ This command can only be used in a server!", ephemeral: true });
    return;
  }

  await interaction.reply("https://therules.fyi");
}
