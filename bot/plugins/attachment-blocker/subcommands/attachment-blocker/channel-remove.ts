/**
 * /attachment-blocker channel remove — Remove a per-channel override.
 */

import { type TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleChannelRemove(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);

  const deleted = await pluginAPI.service.deleteChannelConfig(channel.id);

  if (!deleted) {
    await interaction.editReply(`ℹ️ No override exists for ${channel}. It already uses guild defaults.`);
    return;
  }

  // Remove permission overrides
  try {
    const textChannel = channel as unknown as TextChannel;
    await textChannel.permissionOverwrites.edit(textChannel.guild.roles.everyone, {
      AttachFiles: null,
    });
  } catch {
    // Non-critical
  }

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Channel Override Removed")
    .setDescription(`Attachment blocking override removed for ${channel}.\nThis channel now uses guild-wide defaults.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  broadcastDashboardChange(interaction.guildId!, "attachment-blocker", "channel_override_removed", { requiredAction: "attachment-blocker.manage_config" });
}
