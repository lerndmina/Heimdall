/**
 * Shared autocomplete handlers for modmail commands
 */

import type { AutocompleteInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../index.js";
import type { ModmailCategory } from "../models/ModmailConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("modmail:autocomplete");

export async function autocomplete(context: Omit<CommandContext, "interaction"> & { interaction: AutocompleteInteraction }): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guild?.id;

  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  // Get plugin API for service access
  const pluginAPI = getPluginAPI<ModmailPluginAPI>("modmail");
  if (!pluginAPI) {
    await interaction.respond([]);
    return;
  }

  try {
    switch (focused.name) {
      case "category": {
        // Get config for category list
        const config = await pluginAPI.modmailService.getConfig(guildId);
        if (!config) {
          await interaction.respond([]);
          return;
        }

        const search = focused.value.toLowerCase();
        const matches = (config.categories as ModmailCategory[])
          .filter((cat: ModmailCategory) => cat.name.toLowerCase().includes(search) || cat.id.includes(search))
          .slice(0, 25)
          .map((cat: ModmailCategory) => ({
            name: `${cat.emoji || "📁"} ${cat.name}${!cat.enabled ? " (disabled)" : ""}`,
            value: cat.id,
          }));

        await interaction.respond(matches);
        break;
      }

      default:
        await interaction.respond([]);
    }
  } catch (error) {
    log.error("Autocomplete error:", error);
    await interaction.respond([]);
  }
}
