/**
 * /attachment-blocker bypass channel-list — List bypass roles for one channel.
 */

import { ChannelType } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleBypassChannelList(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildForum) {
    await interaction.editReply("❌ The channel must be a text, announcement, voice, or forum channel.");
    return;
  }

  const config = await pluginAPI.service.getChannelConfig(channel.id);
  const bypassRoleIds = config?.bypassRoleIds ?? [];

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛡️ Channel Bypass Roles")
    .setDescription(`${channel}\n\n${bypassRoleIds.length > 0 ? bypassRoleIds.map((id) => `<@&${id}>`).join("\n") : "No bypass roles configured for this channel."}`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
