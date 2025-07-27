import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../../Bot";
import Database from "../../../utils/data/database";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import ModmailConfig, { TicketPriority } from "../../../models/ModmailConfig";

export const listCategoriesOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

/**
 * List all modmail categories
 */
export default async function listCategories({ interaction, client, handler }: SlashCommandProps) {
  const { data: _, error: replyError } = await tryCatch(interaction.reply(waitingEmoji));
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

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

    const embed = new EmbedBuilder()
      .setTitle("📋 Modmail Categories")
      .setColor(0x3498db)
      .setTimestamp()
      .setFooter({
        text: `Requested by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    let description = "";
    let fieldCount = 0;

    // Show default category if exists
    if (config.defaultCategory) {
      const defaultCat = config.defaultCategory;
      description += `**🏠 Default Category**\n`;
      description += `**Name:** ${defaultCat.name}\n`;
      description += `**Status:** ${defaultCat.isActive ? "✅ Active" : "❌ Inactive"}\n`;
      description += `**Priority:** ${
        TicketPriority[defaultCat.priority as TicketPriority] || defaultCat.priority
      }\n`;
      description += `**Forum:** <#${config.forumChannelId}> *(inherits from main config)*\n`;
      description += `**Staff Role:** <@&${config.staffRoleId}> *(inherits from main config)*\n`;
      if (defaultCat.description) {
        description += `**Description:** ${defaultCat.description}\n`;
      }
      if (defaultCat.formFields && defaultCat.formFields.length > 0) {
        description += `**Form Fields:** ${defaultCat.formFields.length}\n`;
      }
      description += "\n";
    }

    // Show additional categories
    const categories = config.categories || [];
    if (categories.length === 0 && !config.defaultCategory) {
      embed.setDescription(
        "No categories configured. Use `/modmail category create` to create your first category."
      );
    } else {
      if (categories.length > 0) {
        description += `**📁 Additional Categories (${categories.length})**\n\n`;

        for (const category of categories) {
          const statusIcon = category.isActive ? "✅" : "❌";
          const priorityName =
            TicketPriority[category.priority as TicketPriority] || category.priority;
          const formFieldCount = category.formFields ? category.formFields.length : 0;

          if (fieldCount < 24) {
            // Discord embed field limit
            embed.addFields([
              {
                name: `${category.emoji || "📁"} ${category.name}`,
                value:
                  `**ID:** \`${category.id}\`\n` +
                  `**Status:** ${statusIcon} ${category.isActive ? "Active" : "Inactive"}\n` +
                  `**Priority:** ${priorityName}\n` +
                  `**Forum:** <#${category.forumChannelId}>\n` +
                  `**Staff Role:** ${
                    category.staffRoleId
                      ? `<@&${category.staffRoleId}>`
                      : `<@&${config.staffRoleId}> *(inherits)*`
                  }\n` +
                  `${category.description ? `**Description:** ${category.description}\n` : ""}` +
                  `**Form Fields:** ${formFieldCount}`,
                inline: true,
              },
            ]);
            fieldCount++;
          } else {
            // If we exceed field limit, add to description
            description += `${statusIcon} **${category.name}** (${priorityName})\n`;
          }
        }
      }

      if (description) {
        embed.setDescription(description);
      }
    }

    // Add usage information
    embed.addFields([
      {
        name: "📝 Management Commands",
        value:
          "`/modmail category create` - Create a new category\n" +
          "`/modmail category edit` - Edit an existing category\n" +
          "`/modmail category delete` - Delete a category\n" +
          "`/modmail category form` - Manage form fields",
        inline: false,
      },
    ]);

    return interaction.editReply({
      content: "",
      embeds: [embed],
    });
  } catch (error) {
    log.error("Error listing categories:", error);
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Failed to List Categories",
          `An error occurred while fetching categories: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        ),
      ],
    });
  }
}
