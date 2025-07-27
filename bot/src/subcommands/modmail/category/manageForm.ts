import { SlashCommandBuilder } from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../../Bot";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { FormFieldManager } from "../../../utils/modmail/FormFieldManager";
import ModmailConfig from "../../../models/ModmailConfig";

export const manageFormOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Manage form fields for a category
 */
export default async function manageForm({ interaction, client, handler }: SlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  const categoryId = interaction.options.getString("category", true);

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

    // Find the category
    const categories = config.categories || [];
    const category = categories.find((cat) => cat.id === categoryId);

    if (!category) {
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

    const formFieldCount = category.formFields ? category.formFields.length : 0;

    // Initialize form management interface
    const formManager = new FormFieldManager();

    return await formManager.showFormManagementInterface({
      interaction,
      client,
      category,
      config,
    });
  } catch (error) {
    log.error("Error in form management:", error);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Form Management Error",
          `Failed to access form management: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        ),
      ],
    });
  }
}
