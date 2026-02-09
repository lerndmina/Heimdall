/**
 * /modmail toggle-autoclose - Toggle auto-close for the current thread
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { requireModmailThread } from "../../utils/subcommandGuards.js";
import Modmail, { ModmailStatus } from "../../models/Modmail.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:toggle-autoclose");

export async function handleToggleAutoclose(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const modmail = await requireModmailThread(interaction, pluginAPI);
  if (!modmail) return;

  // Check if closed
  if (modmail.status === ModmailStatus.CLOSED) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.warning("Already Closed", "This modmail thread has already been closed. Auto-close settings cannot be changed.")],
    });
    return;
  }

  // Check permissions
  const member = interaction.member as GuildMember;
  const isStaff = await ModmailPermissions.isStaff(member, interaction.guildId!);
  if (!isStaff) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to modify modmail settings.")],
    });
    return;
  }

  try {
    // Toggle auto-close disabled flag
    const newValue = !modmail.autoCloseDisabled;

    await Modmail.updateOne({ modmailId: modmail.modmailId }, { $set: { autoCloseDisabled: newValue } });
    broadcastDashboardChange(interaction.guildId!, "modmail", "conversation_updated", { requiredAction: "modmail.view_conversations" });

    if (newValue) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.success("Auto-Close Disabled", "Auto-close has been **disabled** for this thread.\n\n" + "This thread will not be automatically closed due to inactivity.")],
      });
    } else {
      // Get config for auto-close hours
      const config = await pluginAPI.modmailService.getConfig(interaction.guildId!);
      const category = config?.categories.find((cat) => cat.id === modmail.categoryId);
      const autoCloseHours = category?.autoCloseHours || config?.autoCloseHours || 72;

      await interaction.editReply({
        embeds: [
          ModmailEmbeds.success("Auto-Close Enabled", "Auto-close has been **enabled** for this thread.\n\n" + `This thread will automatically close after **${autoCloseHours} hours** of inactivity.`),
        ],
      });
    }
  } catch (error) {
    log.error("Toggle auto-close error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Update Failed", "Failed to toggle auto-close. Please try again.")],
    });
  }
}
