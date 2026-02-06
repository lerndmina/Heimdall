/**
 * Autocomplete handler for /logging toggle command
 */

import type { AutocompleteInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export async function autocomplete(context: Omit<CommandContext, "interaction"> & { interaction: AutocompleteInteraction }): Promise<void> {
  const { interaction } = context;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== "toggle") {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);

  if (focused.name === "category") {
    const categories = [
      { name: "Messages", value: "messages" },
      { name: "Users", value: "users" },
      { name: "Moderation", value: "moderation" },
    ];

    const filtered = categories.filter((c) => c.name.toLowerCase().includes(focused.value.toLowerCase()));

    await interaction.respond(filtered.slice(0, 25));
  } else if (focused.name === "subcategory") {
    const selectedCategory = interaction.options.getString("category");

    let subcategories: Array<{ name: string; value: string }> = [];

    switch (selectedCategory) {
      case "messages":
        subcategories = [
          { name: "Edits", value: "edits" },
          { name: "Deletes", value: "deletes" },
          { name: "Bulk Deletes", value: "bulk_deletes" },
        ];
        break;
      case "users":
        subcategories = [
          { name: "Profile Updates", value: "profile_updates" },
          { name: "Member Updates", value: "member_updates" },
        ];
        break;
      case "moderation":
        subcategories = [
          { name: "Bans", value: "bans" },
          { name: "Unbans", value: "unbans" },
          { name: "Timeouts", value: "timeouts" },
        ];
        break;
    }

    const filtered = subcategories.filter((s) => s.name.toLowerCase().includes(focused.value.toLowerCase()));

    await interaction.respond(filtered.slice(0, 25));
  } else {
    await interaction.respond([]);
  }
}
