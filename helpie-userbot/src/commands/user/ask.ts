/**
 * Ask command - Ask Helpie AI a question
 *
 * Example usage: /ask message:"What is the meaning of life?"
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import HelpieReplies from "../../utils/HelpieReplies";
import { processAskQuestion } from "../../utils/AskHelpie";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask Helpie AI a question")
  .addStringOption((option) => option.setName("message").setDescription("Your question for Helpie").setRequired(true).setMaxLength(2000));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const message = interaction.options.getString("message", true);

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction);

  // Process the question using shared logic
  await processAskQuestion({
    message,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    interaction,
  });
}
