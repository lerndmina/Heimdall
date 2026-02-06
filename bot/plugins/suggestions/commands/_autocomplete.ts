/**
 * Autocomplete handler for suggestion-categories command
 */

import type { AutocompleteInteraction } from "discord.js";
import { SuggestionConfigHelper } from "../models/SuggestionConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("suggestions:autocomplete");

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name === "category") {
    try {
      const categories = await SuggestionConfigHelper.getAllCategories(interaction.guildId!);

      const choices = categories
        .filter((cat) => cat.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
        .slice(0, 25)
        .map((cat) => ({
          name: `${cat.emoji || "📁"} ${cat.name} ${cat.isActive ? "" : "(disabled)"}`,
          value: cat.id,
        }));

      await interaction.respond(choices);
    } catch (error) {
      log.error("Error in category autocomplete:", error);
      await interaction.respond([]);
    }
  }
}
