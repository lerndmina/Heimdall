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
import HelpieReplies, { HelpieEmoji, InteractionDeletedError } from "./HelpieReplies";
import TemporaryContextManager from "./TemporaryContextManager";

const env = fetchEnvs();

export const prelude = `# Hey there! I'm Helpie, an AI designed to help you get answers quickly.\n\n`;

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

    // Fetch any temporary contexts stored by the user (from "Add to Context" command)
    const temporaryContexts = await TemporaryContextManager.getAllForUser(userId);

    // Inject permanent context (GitHub URLs) into system prompt if available
    const systemPromptWithContext = resolvedContext ? `${env.SYSTEM_PROMPT}\n\n${resolvedContext}` : env.SYSTEM_PROMPT;

    // Build the final user message by concatenating temporary contexts with the question
    let finalUserMessage = message;
    if (temporaryContexts.length > 0) {
      log.debug(`Found ${temporaryContexts.length} temporary context(s) for user ${userId}`);

      // Concatenate all temporary contexts before the actual question
      const concatenatedContexts = temporaryContexts.map((ctx) => ctx.content).join(" ");
      finalUserMessage = `${concatenatedContexts} ${message}`;
    }

    // Build messages array with the concatenated message
    const messages: Array<{ role: "user"; content: string }> = [
      {
        role: "user",
        content: finalUserMessage,
      },
    ];

    log.debug("Context resolved", {
      userId,
      hasContext: !!resolvedContext,
      contextLength: resolvedContext?.length || 0,
      temporaryContextCount: temporaryContexts.length,
      finalMessageLength: finalUserMessage.length,
      totalMessages: messages.length,
    });

    log.debug("Final prompts constructed", {
      systemPromptLength: systemPromptWithContext.length,
      messageCount: messages.length,
    });

    // Generate AI response using Vercel AI SDK with messages array
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPromptWithContext,
      messages,
    });

    log.debug("AI response generated", { userId, responseLength: text.length });

    // Clear temporary contexts after successful use
    if (temporaryContexts.length > 0) {
      const deletedCount = await TemporaryContextManager.deleteAllForUser(userId);
      log.debug(`Cleared ${deletedCount} temporary context(s) for user ${userId} after use`);
    }

    const responseWithPrelude = `${prelude}${text}`;

    // Discord message content has a 2000 character limit
    const truncatedResponse = responseWithPrelude.length > 1900 ? responseWithPrelude.substring(0, 1900) + "..." : responseWithPrelude;

    // Send response - automatically uses editReply since we should defer first
    await HelpieReplies.success(interaction, truncatedResponse);
  } catch (error) {
    // Clean up temporary contexts even on error (they were meant for this request)
    try {
      const temporaryContexts = await TemporaryContextManager.getAllForUser(userId);
      if (temporaryContexts.length > 0) {
        const deletedCount = await TemporaryContextManager.deleteAllForUser(userId);
        log.debug(`Cleared ${deletedCount} temporary context(s) for user ${userId} after error`);
      }
    } catch (cleanupError) {
      log.error("Failed to cleanup temporary contexts after error:", cleanupError);
    }

    // Handle deleted message - user deleted message while processing
    if (error instanceof InteractionDeletedError) {
      log.debug("User deleted message while processing AI request", { userId });
      return; // Silently exit - nothing we can do
    }

    log.error("Error processing AI request:", error);

    // Attempt to send error message, but catch if interaction was deleted
    try {
      await HelpieReplies.error(interaction, "An error occurred while processing your question. Please try again later.");
    } catch (replyError) {
      if (replyError instanceof InteractionDeletedError) {
        log.debug("Cannot send error message - interaction was deleted", { userId });
        return;
      }
      // Log other reply errors but don't throw
      log.error("Failed to send error message:", replyError);
    }
  }
}
