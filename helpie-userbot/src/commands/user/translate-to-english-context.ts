/**
 * Translate to English Context Menu Command
 *
 * Right-click any message to translate it to English using DeepL API.
 * Automatically detects the source language and translates to English.
 */

import { ContextMenuCommandBuilder, ApplicationCommandType, MessageContextMenuCommandInteraction, Client, InteractionContextType, EmbedBuilder } from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import * as deepl from "deepl-node";
import fetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = fetchEnvs();

export const data = new ContextMenuCommandBuilder()
  .setName("Utils -> Translate")
  .setType(ApplicationCommandType.Message)
  .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Check if DeepL API key is configured
  if (!env.DEEPL_API_KEY || env.DEEPL_API_KEY.trim() === "") {
    return HelpieReplies.error(interaction, "Translation feature is not configured. Please contact the bot owner.", true);
  }

  // Get the target message
  const targetMessage = interaction.targetMessage;

  // Extract message content
  let messageContent = targetMessage.content;

  // If message has no text content, check for embeds
  if (!messageContent || messageContent.trim().length === 0) {
    if (targetMessage.embeds.length > 0) {
      const embed = targetMessage.embeds[0];
      messageContent = `${embed.title || ""}${embed.title && embed.description ? "\n\n" : ""}${embed.description || ""}`.trim();

      if (!messageContent) {
        return HelpieReplies.warning(interaction, "This message has no translatable text content.", true);
      }
    } else {
      return HelpieReplies.warning(interaction, "This message has no text content to translate.", true);
    }
  }

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction, true);

  try {
    // Initialize DeepL client
    const translator = new deepl.DeepLClient(env.DEEPL_API_KEY);

    // Translate to English (null source = auto-detect)
    const result = await translator.translateText(messageContent, null, "en-US");

    // Check if the detected language is already English
    if (result.detectedSourceLang.toLowerCase().startsWith("en")) {
      return HelpieReplies.editSuccess(interaction, {
        title: "Already in English",
        message: "This message is already in English, no translation needed!",
      });
    }

    // Format the language name
    const languageNames: Record<string, string> = {
      ar: "Arabic",
      bg: "Bulgarian",
      cs: "Czech",
      da: "Danish",
      de: "German",
      el: "Greek",
      es: "Spanish",
      et: "Estonian",
      fi: "Finnish",
      fr: "French",
      hu: "Hungarian",
      id: "Indonesian",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      lt: "Lithuanian",
      lv: "Latvian",
      nb: "Norwegian",
      nl: "Dutch",
      pl: "Polish",
      pt: "Portuguese",
      ro: "Romanian",
      ru: "Russian",
      sk: "Slovak",
      sl: "Slovenian",
      sv: "Swedish",
      tr: "Turkish",
      uk: "Ukrainian",
      zh: "Chinese",
    };

    const detectedLanguage = languageNames[result.detectedSourceLang.toLowerCase()] || result.detectedSourceLang;

    // Create response embed
    const embed = new EmbedBuilder()
      .setColor(0x00d4aa) // DeepL brand color
      .setTitle("🌐 Translation")
      .setDescription(`**Detected Language:** ${detectedLanguage}\n\n**Translation:**\n${result.text}`)
      .setFooter({ text: `Translated by DeepL • ${result.billedCharacters} characters` })
      .setTimestamp();

    await HelpieReplies.editCustomEmbed(interaction, embed);
    log.debug(`Translation complete: ${detectedLanguage} -> English (${result.billedCharacters} chars)`);
  } catch (error: any) {
    log.error("Translation error:", error);

    // Handle specific DeepL errors
    if (error.message?.includes("quota")) {
      return HelpieReplies.editError(interaction, {
        title: "Translation Quota Exceeded",
        message: "The translation quota has been reached. Please try again later.",
      });
    } else if (error.message?.includes("403") || error.message?.includes("401")) {
      return HelpieReplies.editError(interaction, {
        title: "Authentication Error",
        message: "There was an issue with the translation service authentication.",
      });
    } else {
      return HelpieReplies.editError(interaction, {
        title: "Translation Failed",
        message: `An error occurred while translating: ${error.message || "Unknown error"}`,
      });
    }
  }
}
