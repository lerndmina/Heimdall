/**
 * /modmail ban - Ban a user from modmail
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { ModmailPluginAPI } from "../../index.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { ModmailPermissions } from "../../utils/ModmailPermissions.js";
import { SupportBanSystem } from "../../../support-core/index.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:cmd:ban");

export async function handleBan(context: CommandContext, pluginAPI: ModmailPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);
  const durationStr = interaction.options.getString("duration");
  const permanent = interaction.options.getBoolean("permanent") ?? !durationStr;

  // Check permissions
  const member = interaction.member as GuildMember;
  const canBan = ModmailPermissions.canBanUsers(member);
  if (!canBan) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("No Permission", "You do not have permission to ban users from modmail.")],
    });
    return;
  }

  // Validate target user
  if (user.bot) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Invalid User", "You cannot ban a bot from modmail.")],
    });
    return;
  }

  if (user.id === interaction.user.id) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Invalid User", "You cannot ban yourself from modmail.")],
    });
    return;
  }

  // Check if already banned
  const isBanned = await pluginAPI.modmailService.isUserBanned(interaction.guildId!, user.id);
  if (isBanned) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.warning("Already Banned", `${user.username} is already banned from modmail.\n\n` + "Use `/modmail unban` to lift the ban first.")],
    });
    return;
  }

  // Calculate expiry date
  let expiresAt: Date | undefined;
  if (!permanent && durationStr) {
    const msValue = pluginAPI.lib.parseDuration(durationStr);
    if (!msValue || typeof msValue !== "number") {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Invalid Duration", "Please provide a valid duration (e.g., `1d`, `7d`, `30d`, `1h`).")],
      });
      return;
    }
    expiresAt = new Date(Date.now() + msValue);
  }

  try {
    // Use support-core ban service
    const { SupportBan } = pluginAPI.supportCore;
    await SupportBan.create({
      guildId: interaction.guildId,
      system: SupportBanSystem.MODMAIL,
      userId: user.id,
      bannedBy: interaction.user.id,
      reason,
      expiresAt,
    });

    // If the user has an active modmail in this thread, close it via central close
    const activeModmail = await pluginAPI.modmailService.getModmailByThreadId(interaction.channelId);
    if (activeModmail && activeModmail.userId === user.id && activeModmail.status !== "closed") {
      await pluginAPI.interactionService.executeClose({
        modmail: activeModmail,
        closedBy: interaction.user.id,
        closedByDisplayName: interaction.user.displayName,
        reason: `User banned: ${reason}`,
        isStaff: true,
        staffAvatarURL: interaction.user.displayAvatarURL(),
      });
    }

    // Try to DM the user about the ban (separate from close DM)
    try {
      await user.send({
        embeds: [ModmailEmbeds.userBanned(interaction.guild!.name, reason, expiresAt)],
      });
    } catch {
      // User has DMs disabled
    }

    const expiryText = expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : "**Permanent**";

    await interaction.editReply({
      embeds: [ModmailEmbeds.success("User Banned", `${user} has been banned from modmail.\n\n` + `**Reason:** ${reason}\n` + `**Expires:** ${expiryText}`)],
    });
    broadcastDashboardChange(interaction.guildId!, "modmail", "user_banned", { requiredAction: "modmail.manage_config" });
  } catch (error) {
    log.error("Modmail ban error:", error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Ban Failed", "Failed to ban user. Please try again.")],
    });
  }
}
