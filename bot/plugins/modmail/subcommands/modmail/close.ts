/**
 * /modmail close - Close the current modmail thread
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { requireModmailThread } from "../../utils/subcommandGuards.js";
import { ModmailStatus } from "../../models/Modmail.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:close");

export async function handleClose(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const modmail = await requireModmailThread(interaction, pluginAPI);
  if (!modmail) return;

  // Check if already closed
  if (modmail.status === ModmailStatus.CLOSED) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.warning("Already Closed", "This modmail thread has already been closed.")],
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  const canClose = await ModmailPermissions.canClose(member, interaction.guildId!, modmail.userId);
  if (!canClose) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to close this modmail thread.")],
    });
    return;
  }

  const reason = interaction.options.getString("reason") || "No reason provided";

  try {
    const staffDisplayName = interaction.user.displayName || interaction.user.username;

    const result = await pluginAPI.interactionService.executeClose({
      modmail,
      closedBy: interaction.user.id,
      closedByDisplayName: staffDisplayName,
      reason,
      isStaff: true,
    });

    if (result.success) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.success("Ticket Closed", "The modmail ticket has been closed.")],
      });
    } else {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Close Failed", "Failed to close the modmail thread. Please try again.")],
      });
    }
  } catch (error) {
    log.error("Modmail close error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Close Failed", "Failed to close the modmail thread. Please try again.")],
    });
  }
}
