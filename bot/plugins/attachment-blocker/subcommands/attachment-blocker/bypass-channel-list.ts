/**
 * /attachment-blocker bypass channel-list — List bypass roles for one channel.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";
import { isAttachmentBlockerSupportedChannelType } from "../../../lib/utils/channelTypes.js";

export async function handleBypassChannelList(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);

  const isSupportedChannelType = isAttachmentBlockerSupportedChannelType(channel.type);

  if (!isSupportedChannelType) {
    await interaction.editReply("❌ The channel must be a guild text-capable channel (text, announcement, thread, forum, media, or voice).");
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
