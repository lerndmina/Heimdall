/**
 * Ask command - Ask Helpie AI a question
 *
 * Example: /helpie ask message:"What is the meaning of life?"
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";

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

  await interaction.deferReply();

  try {
    // TODO: Integrate with AI service
    await interaction.editReply({
      content: `**Your question:** ${message}\n\n**Helpie:** I'm not connected to an AI service yet, but I received your question! This is where I would provide an AI-powered response.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: "❌ An error occurred while processing your question.",
    });
  }
}
