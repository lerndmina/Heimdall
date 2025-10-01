/**
 * Ask command - Ask Helpie AI a question
 *
 * Example: /helpie ask message:"What is the meaning of life?"
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import fetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = fetchEnvs();

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
    log.debug("Processing AI request", { userId: interaction.user.id, message });

    // Generate AI response using Vercel AI SDK
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: env.SYSTEM_PROMPT,
      prompt: message,
      temperature: 0.7,
    });

    log.debug("AI response generated", { userId: interaction.user.id, responseLength: text.length });

    // Discord has a 2000 character limit for message content
    const truncatedResponse = text.length > 1900 ? text.substring(0, 1900) + "..." : text;

    await interaction.editReply({
      content: `**Your question:** ${message}\n\n**Helpie:** ${truncatedResponse}`,
    });
  } catch (error) {
    log.error("Error processing AI request:", error);
    await interaction.editReply({
      content: "❌ An error occurred while processing your question. Please try again later.",
    });
  }
}
