/**
 * AskHelpie - Core AI question processing logic
 *
 * Shared function for handling AI questions across different command types
 * (slash commands, context menu commands, etc.)
 */

import { ChatInputCommandInteraction, MessageContextMenuCommandInteraction, User, RepliableInteraction } from "discord.js";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import fetchEnvs from "./FetchEnvs";
import log from "./log";
import { ContextService } from "../services/ContextService";
import HelpieReplies, { HelpieEmoji } from "./HelpieReplies";

const env = fetchEnvs();

export interface AskHelpieOptions {
  message: string;
  userId: string;
  guildId?: string | null;
  interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction;
}

/**
 * Processes an AI question with context resolution
 *
 * @param options - Configuration object containing message, user/guild IDs, and interaction
 * @returns Promise that resolves when the response is sent
 *
 * @example
 * await processAskQuestion({
 *   message: "What is the meaning of life?",
 *   userId: interaction.user.id,
 *   guildId: interaction.guildId,
 *   interaction
 * });
 */
export async function processAskQuestion(options: AskHelpieOptions): Promise<void> {
  const { message, userId, guildId, interaction } = options;

  try {
    log.debug("Processing AI request", { userId, message });

    // Resolve applicable contexts (Global → Guild → User)
    const resolvedContext = await ContextService.resolveContextForAsk(userId, guildId || undefined);

    // Inject context into system prompt if available
    const systemPromptWithContext = resolvedContext ? `${env.SYSTEM_PROMPT}\n\n${resolvedContext}` : env.SYSTEM_PROMPT;

    log.debug("Context resolved", {
      userId,
      hasContext: !!resolvedContext,
      contextLength: resolvedContext.length,
    });

    // Generate AI response using Vercel AI SDK
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPromptWithContext,
      prompt: message,
    });

    log.debug("AI response generated", { userId, responseLength: text.length });

    const responseWithPrelude = `# Hey there! I'm Helpie, an AI designed to help you get answers quickly.
    
    ${text}`;

    // Discord message content has a 2000 character limit
    const truncatedResponse = responseWithPrelude.length > 1900 ? responseWithPrelude.substring(0, 1900) + "..." : responseWithPrelude;

    // Send response - automatically uses editReply since we should defer first
    await HelpieReplies.success(interaction, truncatedResponse);
  } catch (error) {
    log.error("Error processing AI request:", error);
    await HelpieReplies.error(interaction, "An error occurred while processing your question. Please try again later.");
  }
}
