import { SlashCommandBuilder, ForumChannel, ChannelType } from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../../Bot";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import ModmailConfig, { TicketPriority } from "../../../models/ModmailConfig";

export const createCategoryOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageGuild"],
};

/**
 * Create a new modmail category
 */
export default async function createCategory({ interaction, client, handler }: SlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  const name = interaction.options.getString("name", true);
  const description = interaction.options.getString("description");
  const forumChannel = interaction.options.getChannel("forum-channel", true) as ForumChannel;
  const priorityValue = interaction.options.getString("priority");
  const emoji = interaction.options.getString("emoji");
  const staffRole = interaction.options.getRole("staff-role");

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
            "Please set up modmail first using `/modmail setup` before creating categories."
          ),
        ],
      });
    }

    // Validate forum channel
    if (forumChannel.type !== ChannelType.GuildForum) {
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "Invalid Channel Type",
            "The forum channel must be a Forum Channel type."
          ),
        ],
      });
    }

    // Parse priority
    const priority = priorityValue
      ? (parseInt(priorityValue) as TicketPriority)
      : TicketPriority.MEDIUM;

    // Validate emoji if provided
    if (emoji && emoji.length > 10) {
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(client, "Invalid Emoji", "Emoji must be 10 characters or less."),
        ],
      });
    }

    // Check if category name already exists
    const existingCategories = config.categories || [];
    if (existingCategories.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) {
      return interaction.editReply({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "Category Already Exists",
            `A category with the name "${name}" already exists.`
          ),
        ],
      });
    }

    // Create new category object
    const newCategory = {
      id: require("uuid").v4(),
      name,
      description: description || undefined,
      forumChannelId: forumChannel.id,
      staffRoleId: staffRole?.id || undefined, // Optional staff role
      priority,
      emoji: emoji || undefined,
      isActive: true,
      formFields: [], // Start with no form fields
    };

    // Add to categories array
    const updatedCategories = [...existingCategories, newCategory];

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
          "Category Created",
          `Successfully created category **${name}** with ID \`${newCategory.id}\`.\n\n` +
            `**Priority:** ${TicketPriority[priority]}\n` +
            `**Forum Channel:** <#${forumChannel.id}>\n` +
            `**Staff Role:** ${
              staffRole ? `<@&${staffRole.id}>` : "*Inherits from main config*"
            }\n` +
            `${description ? `**Description:** ${description}\n` : ""}` +
            `${emoji ? `**Emoji:** ${emoji}\n` : ""}\n` +
            `Use \`/modmail category form\` to add form fields to this category.`
        ),
      ],
    });
  } catch (error) {
    log.error("Error creating category:", error);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Category Creation Failed",
          `Failed to create category: ${error instanceof Error ? error.message : "Unknown error"}`
        ),
      ],
    });
  }
}
