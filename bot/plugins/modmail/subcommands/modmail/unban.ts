/**
 * /modmail unban - Unban a user from modmail
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:unban");

export async function handleUnban(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);

  // Check permissions
  const member = interaction.member as GuildMember;
  const canBan = ModmailPermissions.canBanUsers(member);
  if (!canBan) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to unban users from modmail.")],
    });
    return;
  }

  // Check if actually banned
  const isBanned = await pluginAPI.modmailService.isUserBanned(interaction.guildId!, user.id);
  if (!isBanned) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.info("Not Banned", `${user.username} is not currently banned from modmail.`)],
    });
    return;
  }

  try {
    // Use support-core ban service (removeBan deactivates + preserves history)
    const { SupportBan } = pluginAPI.supportCore;
    const result = await SupportBan.removeBan(interaction.guildId!, user.id, interaction.user.id);

    if (!result) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Unban Failed", "Failed to find and remove the ban.")],
      });
      return;
    }

    // Try to DM the user
    try {
      await user.send({
        embeds: [ModmailEmbeds.success("Modmail Ban Lifted", `Your modmail ban in **${interaction.guild!.name}** has been lifted.\n\n` + "You can now contact support again.")],
      });
    } catch {
      // User has DMs disabled
    }

    await interaction.editReply({
      embeds: [ModmailEmbeds.success("User Unbanned", `${user} has been unbanned from modmail.\n\n` + "They can now contact support again.")],
    });
  } catch (error) {
    log.error("Modmail unban error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Unban Failed", "Failed to unban user. Please try again.")],
    });
  }
}
