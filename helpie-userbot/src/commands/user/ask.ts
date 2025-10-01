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
import { ContextService } from "../../services/ContextService";
import HelpieReplies from "../../utils/HelpieReplies";

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

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction);

  try {
    log.debug("Processing AI request", { userId: interaction.user.id, message });

    // Resolve applicable contexts (Global → Guild → User)
    const resolvedContext = await ContextService.resolveContextForAsk(interaction.user.id, interaction.guildId || undefined);

    // Inject context into system prompt if available
    const systemPromptWithContext = resolvedContext ? `${env.SYSTEM_PROMPT}\n\n${resolvedContext}` : env.SYSTEM_PROMPT;

    log.debug("Context resolved", {
      userId: interaction.user.id,
      hasContext: !!resolvedContext,
      contextLength: resolvedContext.length,
    });

    // Generate AI response using Vercel AI SDK
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPromptWithContext,
      prompt: message,
    });

    log.debug("AI response generated", { userId: interaction.user.id, responseLength: text.length });

    // Discord embed description has a 4096 character limit
    const truncatedResponse = text.length > 3900 ? text.substring(0, 3900) + "..." : text;

    // Edit reply with success and response
    await HelpieReplies.editReply(interaction, {
      type: "success",
      content: {
        title: "AI Response",
        message: `**Your question:** ${message}\n\n**Helpie:** ${truncatedResponse}`,
      },
    });
  } catch (error) {
    log.error("Error processing AI request:", error);
    await HelpieReplies.editError(interaction, "An error occurred while processing your question. Please try again later.");
  }
}
