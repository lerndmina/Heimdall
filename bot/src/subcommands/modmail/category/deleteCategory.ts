import { SlashCommandBuilder } from "discord.js";
import { LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";
import { waitingEmoji } from "../../../Bot";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import ModmailConfig from "../../../models/ModmailConfig";

export const deleteCategoryOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Delete a modmail category
 */
export default async function deleteCategory({
  interaction,
  client,
  handler,
}: LegacySlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  const categoryId = interaction.options.getString("category", true);
  const force = interaction.options.getBoolean("force") || false;

  try {
    const db = new Database();

    // Check if modmail is configured for this guild
    const config = await db.findOne(ModmailConfig, { guildId: interaction.guildId });
    if (!config) {
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "Modmail Not Configured",
            "Please set up modmail first using `/modmail setup` before managing categories."
          ),
        ],
      });
    }

    // Find the category to delete
    const categories = config.categories || [];
    const categoryIndex = categories.findIndex((cat) => cat.id === categoryId);

    if (categoryIndex === -1) {
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "Category Not Found",
            "The specified category could not be found."
          ),
        ],
      });
    }

    const categoryToDelete = categories[categoryIndex];

    // Check for active tickets (if not force)
    if (!force) {
      // TODO: Check for active modmail tickets using this category
      // For now, we'll just show a warning
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "Confirmation Required",
            `Are you sure you want to delete the category **${categoryToDelete.name}**?\n\n` +
              `This action cannot be undone. Use the \`force\` option to confirm deletion.\n\n` +
              `**Command:** \`/modmail category delete category:${categoryToDelete.name} force:True\``
          ),
        ],
      });
    }

    // Remove the category from the array
    const updatedCategories = categories.filter((cat) => cat.id !== categoryId);

    // Update the config
    await db.findOneAndUpdate(
      ModmailConfig,
      { guildId: interaction.guildId },
      { categories: updatedCategories }
    );

    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.success(
          client,
          "Category Deleted",
          `Successfully deleted category **${categoryToDelete.name}**.`
        ),
      ],
    });
  } catch (error) {
    log.error("Error deleting category:", error);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Category Deletion Failed",
          `Failed to delete category: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
      ],
    });
  }
}
