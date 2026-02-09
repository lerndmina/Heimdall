/**
 * /modmail open - Open a modmail thread for a user
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { requireConfig } from "../../utils/subcommandGuards.js";
import { createCloseTicketRow } from "../../utils/modmailButtons.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:open");

export async function handleOpen(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction, client } = context;
  await interaction.deferReply({ ephemeral: true });

  const config = await requireConfig(interaction, pluginAPI);
  if (!config) return;

  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "Staff-initiated modmail";
  const categoryId = interaction.options.getString("category");

  // Check permissions
  const member = interaction.member as GuildMember;
  const isStaff = await ModmailPermissions.isStaff(member, interaction.guildId!);
  if (!isStaff) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to open modmail threads.")],
    });
    return;
  }

  // Validate target user
  if (user.bot) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Invalid User", "You cannot open a modmail thread for a bot.")],
    });
    return;
  }

  if (user.id === interaction.user.id) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Invalid User", "You cannot open a modmail thread for yourself.")],
    });
    return;
  }

  // Check if user is banned
  const isBanned = await pluginAPI.modmailService.isUserBanned(interaction.guildId!, user.id);
  if (isBanned) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.warning("User Banned", `${user.username} is currently banned from using modmail.\n\n` + "Use `/modmail unban` to lift the ban first.")],
    });
    return;
  }

  // Check for existing open modmail
  const hasOpen = await pluginAPI.modmailService.userHasOpenModmail(interaction.guildId!, user.id);
  if (hasOpen) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.warning("Already Open", `${user.username} already has an open modmail thread.\n\n` + "Close the existing thread before opening a new one.")],
    });
    return;
  }

  // Determine category
  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId) {
    resolvedCategoryId = config.defaultCategoryId || config.categories[0]?.id;
  }

  if (!resolvedCategoryId) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Category", "No modmail categories are configured.")],
    });
    return;
  }

  // Verify category exists
  const category = config.categories.find((cat) => cat.id === resolvedCategoryId);
  if (!category) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Invalid Category", "The selected category does not exist.")],
    });
    return;
  }

  if (!category.enabled) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Category Disabled", "The selected category is currently disabled.")],
    });
    return;
  }

  try {
    // Get target member for display name
    const targetMember = await pluginAPI.lib.thingGetter.getMember(interaction.guild!, user.id);
    const userDisplayName = targetMember?.displayName || user.displayName || user.username;

    // Create the modmail
    const result = await pluginAPI.creationService.createModmail({
      guildId: interaction.guildId!,
      userId: user.id,
      userDisplayName,
      initialMessage: reason,
      categoryId: resolvedCategoryId,
      createdVia: "command",
    });

    if (!result.success) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Creation Failed", result.error || "Failed to create modmail thread.")],
      });
      return;
    }

    // Try to DM the user with close button
    try {
      const closeRow = await createCloseTicketRow(pluginAPI.lib);

      await user.send({
        embeds: [ModmailEmbeds.threadCreated(interaction.guild!.name, category.name, reason)],
        components: [closeRow],
      });
    } catch {
      // User has DMs disabled, continue anyway
    }

    await interaction.editReply({
      embeds: [
        ModmailEmbeds.success(
          "Modmail Opened",
          `A modmail thread has been created for ${user}.\n\n` + `**Ticket #:** ${result.metadata?.ticketNumber}\n` + `**Category:** ${category.name}\n` + `**Thread:** <#${result.channelId}>`,
        ),
      ],
    });
    broadcastDashboardChange(interaction.guildId!, "modmail", "conversation_created", { requiredAction: "modmail.view_conversations" });
  } catch (error) {
    log.error("Modmail open error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Creation Failed", "Failed to create modmail thread. Please try again.")],
    });
  }
}
