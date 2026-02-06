/**
 * AI Helper Utility for Suggestions
 * Handles AI-powered title generation using OpenAI
 */

import { createLogger } from "../../../src/core/Logger.js";
import type { GuildEnvService } from "../../../src/core/services/GuildEnvService.js";

const log = createLogger("suggestions:ai");

/** Generate a suggestion title using AI. Falls back to truncated text if unavailable. */
export async function generateAISuggestionTitle(suggestion: string, reason: string, guildId: string, guildEnvService: GuildEnvService): Promise<string> {
  try {
    const apiKey = await guildEnvService.getEnv(guildId, "OPENAI_API_KEY");

    if (!apiKey) {
      log.debug(`No OpenAI API key found for guild ${guildId}, using fallback title`);
      return generateFallbackTitle(suggestion);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise, clear titles for user suggestions. The title should be 3-8 words, descriptive, and actionable. Do not include quotes or extra formatting.",
          },
          {
            role: "user",
            content: `Generate a concise title for this suggestion:\n\nSuggestion: ${suggestion}\n\nReason: ${reason}`,
          },
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      log.error(`OpenAI API error: ${response.status} ${response.statusText}`);
      return generateFallbackTitle(suggestion);
    }

    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const title = data.choices[0]?.message?.content?.trim();

    if (!title) {
      log.warn("OpenAI returned empty title");
      return generateFallbackTitle(suggestion);
    }

    const cleanTitle = title.replace(/^["']|["']$/g, "").substring(0, 100);
    log.debug(`Generated AI title: "${cleanTitle}"`);
    return cleanTitle;
  } catch (error) {
    log.error("Error generating AI title:", error);
    return generateFallbackTitle(suggestion);
  }
}

/** Generate a fallback title from the suggestion text */
export function generateFallbackTitle(suggestion: string): string {
  const firstSentence = suggestion.split(/[.!?]/)[0] || suggestion;
  return firstSentence.length > 60 ? firstSentence.substring(0, 57) + "..." : firstSentence;
}

/** Check if guild has AI features enabled and API key configured */
export async function hasAICapabilities(guildId: string, guildEnvService: GuildEnvService): Promise<boolean> {
  const apiKey = await guildEnvService.getEnv(guildId, "OPENAI_API_KEY");
  return !!apiKey;
}
