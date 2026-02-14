import type { AutocompleteInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../index.js";

export async function autocomplete(context: Omit<CommandContext, "interaction"> & { interaction: AutocompleteInteraction }): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guild?.id;

  if (!guildId || focused.name !== "panel") {
    await interaction.respond([]);
    return;
  }

  try {
    const api = getPluginAPI<RoleButtonsPluginAPI>("rolebuttons");
    if (!api) {
      await interaction.respond([]);
      return;
    }

    const panels = await api.roleButtonService.listPanels(guildId);
    const q = String(focused.value || "").toLowerCase();
    const choices = panels
      .filter((panel) => !q || panel.name.toLowerCase().includes(q))
      .slice(0, 25)
      .map((panel) => ({
        name: `${panel.name} (${panel.buttons?.length ?? 0} buttons)`,
        value: panel.name,
      }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}
