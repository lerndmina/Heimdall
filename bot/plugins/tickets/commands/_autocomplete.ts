/**
 * Shared autocomplete handlers for ticket commands
 */

import type { AutocompleteInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import TicketCategory from "../models/TicketCategory.js";
import TicketOpener from "../models/TicketOpener.js";
import { CategoryType } from "../types/index.js";

export async function autocomplete(context: Omit<CommandContext, "interaction"> & { interaction: AutocompleteInteraction }): Promise<void> {
  const { interaction } = context;
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guild?.id;

  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  try {
    switch (focused.name) {
      case "category": {
        // For /ticket commands: show only child categories
        // For /ticket-admin edit/delete: show all categories
        const commandName = interaction.commandName;
        const query = focused.value.toLowerCase();

        const filter: Record<string, unknown> = { guildId, isActive: true };

        // /ticket open and /ticket move need child categories only
        if (commandName === "ticket") {
          filter.type = CategoryType.CHILD;
        }

        const categories = await TicketCategory.find(filter).limit(25);
        const choices = categories
          .filter((cat) => cat.name.toLowerCase().includes(query) || cat.id.toLowerCase().includes(query))
          .map((cat) => ({
            name: commandName === "ticket-admin" ? `${cat.name} (${cat.type})` : cat.name,
            value: cat.id,
          }))
          .slice(0, 25);

        await interaction.respond(choices);
        break;
      }

      case "parent": {
        // Show only parent categories for nesting
        const query = focused.value.toLowerCase();
        const categories = await TicketCategory.find({
          guildId,
          type: CategoryType.PARENT,
          isActive: true,
        }).limit(25);

        const choices = categories
          .filter((cat) => cat.name.toLowerCase().includes(query) || cat.id.toLowerCase().includes(query))
          .map((cat) => ({
            name: cat.name,
            value: cat.id,
          }))
          .slice(0, 25);

        await interaction.respond(choices);
        break;
      }

      case "opener": {
        const query = focused.value.toLowerCase();
        const openers = await TicketOpener.find({ guildId }).limit(25);

        const choices = openers
          .filter((opener) => opener.name.toLowerCase().includes(query) || opener.id.toLowerCase().includes(query))
          .map((opener) => ({
            name: `${opener.name} (${opener.uiType})`,
            value: opener.id,
          }))
          .slice(0, 25);

        await interaction.respond(choices);
        break;
      }

      case "remove_category": {
        // Show categories that are currently in the selected opener
        const openerId = interaction.options.getString("opener");
        const query = focused.value.toLowerCase();

        if (!openerId) {
          await interaction.respond([]);
          return;
        }

        const opener = await TicketOpener.findOne({ id: openerId, guildId });
        if (!opener || opener.categoryIds.length === 0) {
          await interaction.respond([]);
          return;
        }

        const categories = await TicketCategory.find({
          id: { $in: opener.categoryIds },
          guildId,
        }).limit(25);

        const choices = categories
          .filter((cat) => cat.name.toLowerCase().includes(query) || cat.id.toLowerCase().includes(query))
          .map((cat) => ({
            name: cat.name,
            value: cat.id,
          }))
          .slice(0, 25);

        await interaction.respond(choices);
        break;
      }

      default:
        await interaction.respond([]);
    }
  } catch (error) {
    await interaction.respond([]);
  }
}
