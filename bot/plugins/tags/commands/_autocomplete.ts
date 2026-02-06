/**
 * Shared autocomplete handler for tag commands
 */

import type { AutocompleteInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { TagsPluginAPI } from "../index.js";

export async function autocomplete(context: Omit<CommandContext, "interaction"> & { interaction: AutocompleteInteraction }): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guild?.id;

  if (!guildId || focused.name !== "name") {
    await interaction.respond([]);
    return;
  }

  try {
    const pluginAPI = getPluginAPI<TagsPluginAPI>("tags");
    if (!pluginAPI) {
      await interaction.respond([]);
      return;
    }

    const choices = await pluginAPI.tagService.autocomplete(guildId, focused.value);
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}
