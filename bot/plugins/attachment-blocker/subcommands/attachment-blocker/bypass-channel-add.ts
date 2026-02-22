/**
 * /attachment-blocker bypass channel-add — Add a bypass role for one channel.
 */

import { ChannelType } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleBypassChannelAdd(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const channel = interaction.options.getChannel("channel", true);
  const role = interaction.options.getRole("role", true);

  const guildMediaType = (ChannelType as unknown as Record<string, number>).GuildMedia;
  const isSupportedChannelType =
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildForum ||
    (typeof guildMediaType === "number" && channel.type === guildMediaType);

  if (!isSupportedChannelType) {
    await interaction.editReply("❌ The channel must be a text-capable guild channel (text, announcement, forum, media, or voice).");
    return;
  }

  const existing = await pluginAPI.service.getChannelConfig(channel.id);
  const currentBypass = existing?.bypassRoleIds ?? [];

  if (currentBypass.includes(role.id)) {
    await interaction.editReply(`ℹ️ ${role} already bypasses attachment checks in ${channel}.`);
    return;
  }

  const bypassRoleIds = [...currentBypass, role.id];
  await pluginAPI.service.upsertChannelConfig(guildId, channel.id, {
    bypassRoleIds,
    createdBy: interaction.user.id,
  });

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Channel Bypass Role Added")
    .setDescription(`${role} now bypasses attachment-blocker checks in ${channel}.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  broadcastDashboardChange(guildId, "attachment-blocker", "channel_override_updated", { requiredAction: "attachment-blocker.manage_config" });
}
