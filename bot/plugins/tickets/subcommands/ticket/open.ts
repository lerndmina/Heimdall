/**
 * /ticket open - Open a ticket for a user (staff only)
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TicketsAPI } from "../../index.js";
import type { LibAPI } from "../../../lib/index.js";
import { CategoryType } from "../../types/index.js";

export async function handleOpen(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const tickets = getPluginAPI<TicketsAPI>("tickets")!;
  const lib = getPluginAPI<LibAPI>("lib")!;

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const targetUser = interaction.options.getUser("user", true);
    const categoryId = interaction.options.getString("category", true);
    const reason = interaction.options.getString("reason");

    // Validate category exists and is a child category
    const category = await tickets.categoryService.getCategory(categoryId);
    if (!category || category.guildId !== interaction.guild.id) {
      await interaction.editReply({ content: "❌ Category not found." });
      return;
    }

    if (category.type !== CategoryType.CHILD) {
      await interaction.editReply({ content: "❌ Can only open tickets in child categories." });
      return;
    }

    // Check staff permission
    const member = interaction.member as GuildMember;
    const hasPermission = tickets.utils.hasStaffPermission(member, category);
    if (!hasPermission) {
      await interaction.editReply({ content: "❌ You don't have permission to open tickets in this category." });
      return;
    }

    // Create ticket for user using flow service
    await tickets.flowService.openTicketForUser(categoryId, targetUser.id, interaction.user.id, interaction, reason || `Opened by staff: ${interaction.user.tag}`);
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while opening the ticket." });
  }
}
