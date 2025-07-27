import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { waitingEmoji } from "../../Bot";
import Database from "../../utils/data/database";
import log from "../../utils/log";
import { tryCatch } from "../../utils/trycatch";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import ModmailConfig, { TicketPriority } from "../../models/ModmailConfig";

export const migrateCategoriesOptions: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["Administrator"],
};

/**
 * Migrate existing modmail setup to use categories
 */
export default async function migrateCategories({
  interaction,
  client,
  handler,
}: SlashCommandProps) {
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
        embeds: [
          ModmailEmbeds.error(
            client,
            "Modmail Not Configured",
            "Please set up modmail first using `/modmail setup` before running migration."
          ),
        ],
      });
    }

    // Check if categories already exist
    if (config.categories && config.categories.length > 0) {
      return interaction.editReply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Categories Already Exist",
            `This server already has ${config.categories.length} categories configured. Migration is not needed.`
          ),
        ],
      });
    }

    // Create a default category from existing config
    const defaultCategory = {
      id: require("uuid").v4(),
      name: "General Support",
      description: "Default support category for all general inquiries",
      priority: TicketPriority.MEDIUM,
      emoji: "🎫",
      isActive: true,
      formFields: [], // Start with no form fields
      // Note: forumChannelId and staffRoleId are inherited from main config
    };

    // Add the default category to the config
    await db.findOneAndUpdate(
      ModmailConfig,
      { guildId: interaction.guildId },
      { defaultCategory: defaultCategory }
    );

    const embed = new EmbedBuilder()
      .setTitle("✅ Migration Complete")
      .setDescription(
        `Successfully migrated your modmail setup to use the new category system!\n\n` +
          `**Created Default Category:**\n` +
          `• **Name:** ${defaultCategory.name}\n` +
          `• **ID:** \`${defaultCategory.id}\`\n` +
          `• **Priority:** Medium\n` +
          `• **Forum Channel:** <#${config.forumChannelId}> (inherited from main config)\n` +
          `• **Staff Role:** <@&${config.staffRoleId}> (inherited from main config)\n\n` +
          `**Next Steps:**\n` +
          `• Use \`/modmail category create\` to add more categories\n` +
          `• Use \`/modmail category form\` to add forms to categories\n` +
          `• Your existing modmail threads will continue to work normally\n` +
          `• New modmail threads will use the category selection system`
      )
      .setColor(0x00ff00)
      .setTimestamp()
      .setFooter({
        text: `Migration completed by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      });

    return interaction.editReply({
      embeds: [embed],
    });
  } catch (error) {
    log.error("Error during migration:", error);
    return interaction.editReply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Migration Failed",
          `Failed to migrate modmail setup: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        ),
      ],
    });
  }
}
