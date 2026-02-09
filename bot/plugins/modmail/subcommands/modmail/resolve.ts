/**
 * /modmail resolve - Mark current thread as resolved
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { requireModmailThread } from "../../utils/subcommandGuards.js";
import { ModmailStatus } from "../../models/Modmail.js";
import { createResolveButtonRow } from "../../utils/modmailButtons.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:resolve");

export async function handleResolve(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const modmail = await requireModmailThread(interaction, pluginAPI);
  if (!modmail) return;

  // Check if already resolved
  if (modmail.status === ModmailStatus.RESOLVED) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.info("Already Resolved", "This modmail thread is already marked as resolved.")],
    });
    return;
  }

  // Check if closed
  if (modmail.status === ModmailStatus.CLOSED) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Already Closed", "This modmail thread has already been closed.")],
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  const isStaff = await ModmailPermissions.isStaff(member, interaction.guildId!);
  if (!isStaff) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to resolve modmail threads.")],
    });
    return;
  }

  try {
    const resolved = await pluginAPI.modmailService.markResolved(modmail.modmailId, interaction.user.id);

    if (!resolved) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Resolve Failed", "Failed to resolve the modmail thread. Please try again.")],
      });
      return;
    }

    // Get config for auto-close hours
    const config = await pluginAPI.modmailService.getConfig(interaction.guildId!);
    const category = config?.categories.find((cat) => cat.id === modmail.categoryId);
    const autoCloseHours = category?.resolveAutoCloseHours || 24;
    const staffDisplayName = interaction.user.displayName || interaction.user.username;

    // Try to DM the user with resolve buttons
    try {
      const user = await pluginAPI.lib.thingGetter.getUser(modmail.userId);
      if (user) {
        const row = await createResolveButtonRow(pluginAPI.lib, modmail.modmailId);

        await user.send({
          embeds: [ModmailEmbeds.threadResolved(staffDisplayName, autoCloseHours)],
          components: [row],
        });
      }
    } catch {
      // User has DMs disabled or left the server
    }

    // Post resolve message in the forum thread so staff can see it
    try {
      const thread = await pluginAPI.lib.thingGetter.getChannel(modmail.forumThreadId);
      if (thread?.isThread()) {
        await thread.send({
          embeds: [ModmailEmbeds.threadResolved(staffDisplayName, autoCloseHours)],
        });
      }
    } catch {
      // Thread may have been deleted
    }

    // Update starter message status to Resolved
    await pluginAPI.modmailService.updateStarterMessageStatus(modmail.forumThreadId, ModmailStatus.RESOLVED);

    await interaction.editReply({
      embeds: [ModmailEmbeds.threadResolved(staffDisplayName, autoCloseHours)],
    });
    broadcastDashboardChange(interaction.guildId!, "modmail", "conversation_resolved", { requiredAction: "modmail.view_conversations" });
  } catch (error) {
    log.error("Modmail resolve error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Resolve Failed", "Failed to resolve the modmail thread. Please try again.")],
    });
  }
}
