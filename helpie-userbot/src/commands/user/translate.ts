/**
 * Translate Slash Command
 *
 * Translates text from one language to another using DeepL API.
 * Automatically detects the source language if not specified.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, Client, ApplicationIntegrationType, InteractionContextType, EmbedBuilder, AutocompleteInteraction } from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import * as deepl from "deepl-node";
import fetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";

const env = fetchEnvs();

// DeepL supported target languages with their codes (all available languages)
const TARGET_LANGUAGES = [
  { name: "Arabic", value: "ar" },
  { name: "Bulgarian", value: "bg" },
  { name: "Chinese (Simplified)", value: "zh" },
  { name: "Czech", value: "cs" },
  { name: "Danish", value: "da" },
  { name: "Dutch", value: "nl" },
  { name: "English (American)", value: "en-US" },
  { name: "English (British)", value: "en-GB" },
  { name: "Estonian", value: "et" },
  { name: "Finnish", value: "fi" },
  { name: "French", value: "fr" },
  { name: "German", value: "de" },
  { name: "Greek", value: "el" },
  { name: "Hungarian", value: "hu" },
  { name: "Indonesian", value: "id" },
  { name: "Italian", value: "it" },
  { name: "Japanese", value: "ja" },
  { name: "Korean", value: "ko" },
  { name: "Latvian", value: "lv" },
  { name: "Lithuanian", value: "lt" },
  { name: "Norwegian", value: "nb" },
  { name: "Polish", value: "pl" },
  { name: "Portuguese (Brazilian)", value: "pt-BR" },
  { name: "Portuguese (European)", value: "pt-PT" },
  { name: "Romanian", value: "ro" },
  { name: "Russian", value: "ru" },
  { name: "Slovak", value: "sk" },
  { name: "Slovenian", value: "sl" },
  { name: "Spanish", value: "es" },
  { name: "Swedish", value: "sv" },
  { name: "Turkish", value: "tr" },
  { name: "Ukrainian", value: "uk" },
];

// Language names for display (same as context menu command)
const LANGUAGE_NAMES: Record<string, string> = {
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
  "en-us": "English (American)",
  "en-gb": "English (British)",
  "pt-br": "Portuguese (Brazilian)",
  "pt-pt": "Portuguese (European)",
};

export const data = new SlashCommandBuilder()
  .setName("translate")
  .setDescription("Translate text to another language using DeepL")
  .addStringOption((option) => option.setName("text").setDescription("The text to translate (max 5000 characters)").setRequired(true).setMaxLength(5000))
  .addStringOption((option) => option.setName("target_language").setDescription("The language to translate to (start typing to search)").setRequired(true).setAutocomplete(true))
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Check if DeepL API key is configured
  if (!env.DEEPL_API_KEY || env.DEEPL_API_KEY.trim() === "") {
    return HelpieReplies.error(interaction, "Translation feature is not configured. Please contact the bot owner.", true);
  }

  const text = interaction.options.getString("text", true);
  const targetLanguage = interaction.options.getString("target_language", true) as deepl.TargetLanguageCode;

  // Show thinking emoji while processing
  await HelpieReplies.deferThinking(interaction, true);

  try {
    // Initialize DeepL client
    const translator = new deepl.DeepLClient(env.DEEPL_API_KEY);

    // Translate (null source = auto-detect)
    const result = await translator.translateText(text, null, targetLanguage);

    // Check if the detected language is the same as target language
    const detectedLang = result.detectedSourceLang.toLowerCase();
    const targetLang = targetLanguage.toLowerCase().split("-")[0]; // Get base language code

    if (detectedLang === targetLang) {
      const langName = LANGUAGE_NAMES[detectedLang] || result.detectedSourceLang;
      return HelpieReplies.editSuccess(interaction, {
        title: "Already in Target Language",
        message: `This text is already in ${langName}, no translation needed!`,
      });
    }

    // Format the language names
    const detectedLanguageName = LANGUAGE_NAMES[detectedLang] || result.detectedSourceLang;
    const targetLanguageName = LANGUAGE_NAMES[targetLanguage.toLowerCase()] || targetLanguage;

    // Create response embed
    const embed = new EmbedBuilder()
      .setColor(0x00d4aa) // DeepL brand color
      .setTitle("🌐 Translation")
      .addFields(
        { name: "Detected Language", value: detectedLanguageName, inline: true },
        { name: "Target Language", value: targetLanguageName, inline: true },
        { name: "\u200b", value: "\u200b", inline: false }, // Spacer
        { name: "Original Text", value: text.length > 1024 ? text.substring(0, 1021) + "..." : text, inline: false },
        { name: "Translation", value: result.text.length > 1024 ? result.text.substring(0, 1021) + "..." : result.text, inline: false }
      )
      .setFooter({ text: `Translated by DeepL • ${result.billedCharacters} characters` })
      .setTimestamp();

    await HelpieReplies.editCustomEmbed(interaction, embed);
    log.debug(`Translation complete: ${detectedLanguageName} -> ${targetLanguageName} (${result.billedCharacters} chars)`);
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

/**
 * Autocomplete handler for target language selection
 * Filters languages based on user input for easy searching
 */
export async function autocomplete(interaction: AutocompleteInteraction, client: Client) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Filter languages by name or code
    const filtered = TARGET_LANGUAGES.filter((lang) => lang.name.toLowerCase().includes(focusedValue) || lang.value.toLowerCase().includes(focusedValue))
      .slice(0, 25) // Discord limit
      .map((lang) => ({
        name: lang.name,
        value: lang.value,
      }));

    // If no matches, show popular languages
    if (filtered.length === 0) {
      const popularLanguages = [
        { name: "English (American)", value: "en-US" },
        { name: "English (British)", value: "en-GB" },
        { name: "Spanish", value: "es" },
        { name: "French", value: "fr" },
        { name: "German", value: "de" },
        { name: "Italian", value: "it" },
        { name: "Portuguese (Brazilian)", value: "pt-BR" },
        { name: "Russian", value: "ru" },
        { name: "Japanese", value: "ja" },
        { name: "Korean", value: "ko" },
        { name: "Chinese (Simplified)", value: "zh" },
        { name: "Arabic", value: "ar" },
      ];
      await interaction.respond(popularLanguages);
    } else {
      await interaction.respond(filtered);
    }
  } catch (error) {
    log.error("Failed to autocomplete languages:", error);
    await interaction.respond([]);
  }
}
