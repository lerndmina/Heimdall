/**
 * /attachment-blocker bypass channel-remove — Remove a bypass role from one channel.
 */

import { ChannelType } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleBypassChannelRemove(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role", true);

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && channel.type !== ChannelType.GuildVoice) {
    await interaction.editReply("❌ The channel must be a text, announcement, or voice channel.");
    return;
  }

  const existing = await pluginAPI.service.getChannelConfig(channel.id);
  if (!existing) {
    await interaction.editReply(`ℹ️ ${channel} does not have a channel override.`);
    return;
  }

  const currentBypass = existing.bypassRoleIds ?? [];
  if (!currentBypass.includes(role.id)) {
    await interaction.editReply(`ℹ️ ${role} is not a bypass role for ${channel}.`);
    return;
  }

  const bypassRoleIds = currentBypass.filter((id) => id !== role.id);

  const hasOtherOverrides = (existing.allowedTypes && existing.allowedTypes.length > 0) || existing.timeoutDuration != null || existing.enabled === false;
  if (bypassRoleIds.length === 0 && !hasOtherOverrides) {
    await pluginAPI.service.deleteChannelConfig(channel.id);
  } else {
    await pluginAPI.service.upsertChannelConfig(guildId, channel.id, {
      bypassRoleIds,
      createdBy: interaction.user.id,
    });
  }

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Channel Bypass Role Removed")
    .setDescription(`${role} no longer bypasses attachment-blocker checks in ${channel}.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  broadcastDashboardChange(guildId, "attachment-blocker", "channel_override_updated", { requiredAction: "attachment-blocker.manage_config" });
}
