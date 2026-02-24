/**
 * /modmail open - Open a modmail thread for a user
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { createCloseTicketRow } from "../../utils/modmailButtons.js";
import { createLogger } from "../../../../src/core/Logger.js";
import { formatStaffReply } from "../../utils/formatStaffReply.js";

const log = createLogger("modmail:cmd:open");

export async function handleOpen(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "Staff-initiated modmail";
  const mentionRoles = interaction.options.getBoolean("mention_roles");
  const mentionCategoryRoles = interaction.options.getBoolean("mention_category_roles");
  const mentionGlobalRoles = interaction.options.getBoolean("mention_global_roles");
  const categoryId = interaction.options.getString("category");

  const hasGranularMentionOverrides = mentionCategoryRoles !== null || mentionGlobalRoles !== null;
  const includeCategoryRoleMentions = hasGranularMentionOverrides ? (mentionCategoryRoles ?? false) : mentionRoles === true;
  const includeGlobalRoleMentions = hasGranularMentionOverrides ? (mentionGlobalRoles ?? false) : mentionRoles === true;

  // Check permissions
  const member = interaction.member as GuildMember;
  const staffDisplayName = member.displayName || interaction.user.displayName || interaction.user.username;
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

  try {
    // Get target member for display name
    const targetMember = await pluginAPI.lib.thingGetter.getMember(interaction.guild!, user.id);
    const userDisplayName = targetMember?.displayName || user.displayName || user.username;

    // Create the modmail via shared open orchestration
    const openResult = await pluginAPI.creationService.openModmail({
      guildId: interaction.guildId!,
      userId: user.id,
      userDisplayName,
      initialMessage: reason,
      categoryId: categoryId || undefined,
      includeCategoryRoleMentions,
      includeGlobalRoleMentions,
      duplicatePolicy: "open-or-resolved",
      createdVia: "command",
    });

    if (!openResult.success) {
      switch (openResult.code) {
        case "user_banned":
          await interaction.editReply({
            embeds: [ModmailEmbeds.warning("User Banned", `${user.username} is currently banned from using modmail.\n\nUse \`/modmail unban\` to lift the ban first.`)],
          });
          return;
        case "already_open":
          await interaction.editReply({
            embeds: [ModmailEmbeds.warning("Already Open", `${user.username} already has an open or resolved modmail thread.\n\nClose the existing thread before opening a new one.`)],
          });
          return;
        case "invalid_category":
          await interaction.editReply({
            embeds: [ModmailEmbeds.error("Invalid Category", openResult.message || "The selected category does not exist.")],
          });
          return;
        case "category_disabled":
          await interaction.editReply({
            embeds: [ModmailEmbeds.error("Category Disabled", openResult.message || "The selected category is currently disabled.")],
          });
          return;
        case "no_category":
          await interaction.editReply({
            embeds: [ModmailEmbeds.error("No Category", openResult.message || "No modmail categories are configured.")],
          });
          return;
        default:
          await interaction.editReply({
            embeds: [ModmailEmbeds.error("Creation Failed", openResult.message || "Failed to create modmail thread.")],
          });
          return;
      }
    }

    const result = openResult.creationResult;
    const category = openResult.category;

    if (!result?.success || !category) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Creation Failed", "Failed to create modmail thread.")],
      });
      return;
    }

    // Try to DM the user with close button
    try {
      const closeRow = await createCloseTicketRow(pluginAPI.lib);

      await user.send({
        embeds: [ModmailEmbeds.threadOpenedByStaff(interaction.guild!.name, category.name, staffDisplayName)],
        components: [closeRow],
      });

      await user.send({
        content: formatStaffReply(reason, staffDisplayName, interaction.guild!.name),
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
  } catch (error) {
    log.error("Modmail open error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Creation Failed", "Failed to create modmail thread. Please try again.")],
    });
  }
}
