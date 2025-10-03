/**
 * /helpie context clear - Clear all temporary contexts
 *
 * Clears all messages you've added to context using "Add to Context"
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { clearUserContext } from "../../../utils/ClearContext";

export const data = new SlashCommandBuilder().setName("clear").setDescription("Clear all your temporary stored contexts");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Use shared logic to clear context (ephemeral = false for slash commands by default)
  await clearUserContext(interaction, false);
}
