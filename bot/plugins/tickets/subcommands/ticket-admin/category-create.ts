/**
 * /ticket-admin category create - Create a new ticket category
 */

import { ChannelType } from "discord.js";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { TicketsAPI } from "../../index.js";
import TicketCategory from "../../models/TicketCategory.js";
import { CategoryType, DEFAULT_TICKET_NAME_FORMAT } from "../../types/index.js";

export async function handleCategoryCreate(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const name = interaction.options.getString("name", true);
    const type = interaction.options.getString("type", true) as "parent" | "child";
    const description = interaction.options.getString("description", true);
    const discordCategory = interaction.options.getChannel("discord_category");
    const parentId = interaction.options.getString("parent");
    const emoji = interaction.options.getString("emoji");
    const ticketNameFormat = interaction.options.getString("ticket_name_format");

    // Validation
    if (type === "child") {
      if (!discordCategory) {
        await interaction.editReply({ content: "❌ Child categories require a Discord category channel." });
        return;
      }
      if (discordCategory.type !== ChannelType.GuildCategory) {
        await interaction.editReply({ content: "❌ Selected channel must be a category channel." });
        return;
      }
    }

    if (type === "parent" && (discordCategory || parentId)) {
      await interaction.editReply({ content: "❌ Parent categories cannot have a Discord category or parent." });
      return;
    }

    // Check for duplicate name
    const existing = await TicketCategory.findOne({ guildId: interaction.guild.id, name });
    if (existing) {
      await interaction.editReply({ content: "❌ A category with this name already exists." });
      return;
    }

    // Create category
    const categoryId = nanoid(12);
    const category = new TicketCategory({
      id: categoryId,
      guildId: interaction.guild.id,
      name,
      type: type === "parent" ? CategoryType.PARENT : CategoryType.CHILD,
      description,
      emoji: emoji || undefined,
      discordCategoryId: type === "child" ? discordCategory?.id : undefined,
      parentId: parentId || undefined,
      ticketNameFormat: ticketNameFormat || DEFAULT_TICKET_NAME_FORMAT,
      createdBy: interaction.user.id,
      staffRoles: [],
      selectQuestions: [],
      modalQuestions: [],
    });

    await category.save();

    // If this is a child category with a parent, add it to the parent's childIds
    if (parentId) {
      await TicketCategory.updateOne({ id: parentId }, { $push: { childIds: categoryId } });
    }

    await interaction.editReply({
      content: `✅ Created **${type}** category: **${name}**\nID: \`${categoryId}\``,
    });
    broadcastDashboardChange(interaction.guild.id, "tickets", "category_created", {
      requiredAction: "tickets.manage_categories",
    });
  } catch (error) {
    await interaction.editReply({ content: "❌ Failed to create category." });
  }
}
