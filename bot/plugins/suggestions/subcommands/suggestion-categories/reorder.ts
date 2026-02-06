/**
 * /suggestion-categories reorder — Reorder suggestion categories
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-reorder");

export async function handleReorder(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const categories = await SuggestionConfigHelper.getAllCategories(interaction.guildId!);

    if (categories.length === 0) {
      await interaction.reply({ content: "❌ No categories found to reorder.", ephemeral: true });
      return;
    }

    if (categories.length === 1) {
      await interaction.reply({ content: "❌ Only one category exists, no need to reorder.", ephemeral: true });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("🔀 Reorder Categories")
      .setDescription("Current order:\n" + categories.map((cat, index) => `${index + 1}. ${cat.emoji || "📁"} **${cat.name}** ${cat.isActive ? "" : "(disabled)"}`).join("\n"))
      .addFields({
        name: "Instructions",
        value: "Reply with the category numbers in your desired order.\nExample: `1 3 2 4` to move category 3 to position 2",
      })
      .setColor(0x0099ff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Wait for message response
    if (!interaction.channel || !("createMessageCollector" in interaction.channel)) {
      await interaction.followUp({ content: "❌ Cannot set up message collector in this channel type.", ephemeral: true });
      return;
    }

    const filter = (msg: any) => msg.author.id === interaction.user.id;
    const collector = (interaction.channel as any).createMessageCollector({
      filter,
      time: 60_000,
      max: 1,
    });

    collector.on("collect", async (message: any) => {
      try {
        const input = message.content.trim();
        const positions = input.split(/\s+/).map((pos: string) => parseInt(pos, 10));

        if (positions.length !== categories.length) {
          await message.reply("❌ Please provide exactly " + categories.length + " positions.");
          return;
        }

        if (!positions.every((pos: number) => pos >= 1 && pos <= categories.length)) {
          await message.reply(`❌ All positions must be between 1 and ${categories.length}.`);
          return;
        }

        if (new Set(positions).size !== positions.length) {
          await message.reply("❌ Each position must be unique.");
          return;
        }

        const reorderedIds = positions.map((pos: number) => categories[pos - 1]!.id);
        const result = await SuggestionConfigHelper.reorderCategories(interaction.guildId!, reorderedIds, interaction.user.id);

        if (!result.success) {
          await message.reply(`❌ Failed to reorder categories: ${result.error}`);
          return;
        }

        const newCategories = await SuggestionConfigHelper.getAllCategories(interaction.guildId!);
        const newOrderEmbed = pluginAPI.lib
          .createEmbedBuilder()
          .setTitle("✅ Categories Reordered")
          .setDescription("New order:\n" + newCategories.map((cat, index) => `${index + 1}. ${cat.emoji || "📁"} **${cat.name}** ${cat.isActive ? "" : "(disabled)"}`).join("\n"))
          .setColor(0x00ff00)
          .setTimestamp();

        await message.reply({ embeds: [newOrderEmbed] });
      } catch (error) {
        log.error("Error processing reorder:", error);
        await message.reply("❌ An error occurred while reordering categories.");
      }
    });

    collector.on("end", (collected: any) => {
      if (collected.size === 0) {
        interaction.followUp({ content: "⏰ Reorder operation timed out.", ephemeral: true });
      }
    });
  } catch (error) {
    log.error("Error in reorder command:", error);
    await interaction.reply({ content: "❌ An error occurred while setting up category reordering.", ephemeral: true });
  }
}
