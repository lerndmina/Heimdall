import { SlashCommandBuilder, ForumChannel, ChannelType } from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../../Bot";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import ModmailConfig, { TicketPriority } from "../../../models/ModmailConfig";

export const editCategoryOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Edit an existing modmail category
 */
export default async function editCategory({ interaction, client, handler }: SlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  const categoryId = interaction.options.getString("category", true);
  const newName = interaction.options.getString("name");
  const newDescription = interaction.options.getString("description");
  const newForumChannel = interaction.options.getChannel("forum-channel") as ForumChannel | null;
  const newPriorityValue = interaction.options.getString("priority");
  const newEmoji = interaction.options.getString("emoji");

  try {
    const db = new Database();

    // Check if modmail is configured for this guild
    const config = await db.findOne(ModmailConfig, { guildId: interaction.guildId });
    if (!config) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Modmail Not Configured",
            "Please set up modmail first using `/modmail setup` before managing categories."
          ),
        ],
      });
    }

    // Find the category to edit
    const categories = config.categories || [];
    const categoryIndex = categories.findIndex((cat) => cat.id === categoryId);

    if (categoryIndex === -1) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Category Not Found",
            "The specified category could not be found."
          ),
        ],
      });
    }

    const category = categories[categoryIndex];
    let hasChanges = false;
    const changes: string[] = [];

    // Validate and apply changes
    if (newName && newName !== category.name) {
      // Check if name already exists
      if (
        categories.some(
          (cat) => cat.id !== categoryId && cat.name.toLowerCase() === newName.toLowerCase()
        )
      ) {
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Name Already Exists",
              `A category with the name "${newName}" already exists.`
            ),
          ],
        });
      }
      category.name = newName;
      changes.push(`**Name:** ${newName}`);
      hasChanges = true;
    }

    if (newDescription !== null && newDescription !== category.description) {
      category.description = newDescription || undefined;
      changes.push(`**Description:** ${newDescription || "Removed"}`);
      hasChanges = true;
    }

    if (newForumChannel && newForumChannel.id !== category.forumChannelId) {
      if (newForumChannel.type !== ChannelType.GuildForum) {
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Invalid Channel Type",
              "The forum channel must be a Forum Channel type."
            ),
          ],
        });
      }
      category.forumChannelId = newForumChannel.id;
      changes.push(`**Forum Channel:** <#${newForumChannel.id}>`);
      hasChanges = true;
    }

    if (newPriorityValue) {
      const newPriority = parseInt(newPriorityValue) as TicketPriority;
      if (newPriority !== category.priority) {
        category.priority = newPriority;
        changes.push(`**Priority:** ${TicketPriority[newPriority]}`);
        hasChanges = true;
      }
    }

    if (newEmoji !== null && newEmoji !== category.emoji) {
      if (newEmoji && newEmoji.length > 10) {
        return interaction.editReply({
          embeds: [
            ModmailEmbeds.error(client, "Invalid Emoji", "Emoji must be 10 characters or less."),
          ],
        });
      }
      category.emoji = newEmoji || undefined;
      changes.push(`**Emoji:** ${newEmoji || "Removed"}`);
      hasChanges = true;
    }

    if (!hasChanges) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "No Changes Made",
            "No changes were specified. Please provide at least one field to update."
          ),
        ],
      });
    }

    // Update the config
    await db.findOneAndUpdate(ModmailConfig, { guildId: interaction.guildId }, { categories });

    return interaction.editReply({
      embeds: [
        ModmailEmbeds.success(
          client,
          "Category Updated",
          `Successfully updated category **${category.name}**.\n\n**Changes:**\n${changes.join(
            "\n"
          )}`
        ),
      ],
    });
  } catch (error) {
    log.error("Error editing category:", error);
    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Category Edit Failed",
          `Failed to edit category: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
      ],
    });
  }
}
