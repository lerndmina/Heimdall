/**
 * /attachment-blocker view — View current configuration.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";
import { AttachmentType, AttachmentTypeLabels } from "../../utils/attachment-types.js";
import type { IAttachmentBlockerChannel } from "../../models/AttachmentBlockerChannel.js";

export async function handleView(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const guildConfig = await pluginAPI.service.getGuildConfig(guildId);

  if (!guildConfig) {
    await interaction.editReply("ℹ️ Attachment blocking is not configured for this server. Use `/attachment-blocker setup` to get started.");
    return;
  }

  const typesDisplay = (guildConfig.defaultAllowedTypes as AttachmentType[]).map((t) => AttachmentTypeLabels[t] ?? t).join(", ") || "None";

  const timeoutDisplay = guildConfig.defaultTimeoutDuration > 0 ? `${guildConfig.defaultTimeoutDuration / 1000}s` : "Disabled";

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(guildConfig.enabled ? 0x5865f2 : 0x777777)
    .setTitle("📎 Attachment Blocker Configuration")
    .addFields(
      { name: "Status", value: guildConfig.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Default Whitelist", value: typesDisplay, inline: true },
      { name: "Default Timeout", value: timeoutDisplay, inline: true },
    );

  // Show channel overrides
  const channels = await pluginAPI.service.getChannelConfigs(guildId);
  if (channels.length > 0) {
    const channelLines = channels.map((ch: IAttachmentBlockerChannel & { channelId: string }) => {
      const types = (ch.allowedTypes as AttachmentType[] | undefined)?.map((t) => AttachmentTypeLabels[t] ?? t).join(", ") || "Inherits default";
      const timeout = ch.timeoutDuration !== undefined && ch.timeoutDuration !== null ? `${(ch.timeoutDuration as number) / 1000}s` : "Inherits default";
      const status = ch.enabled ? "" : " (disabled)";
      return `<#${ch.channelId}>${status}\n  Types: ${types} • Timeout: ${timeout}`;
    });

    // Split into chunks if too long
    const chunked = channelLines.join("\n\n");
    if (chunked.length <= 1024) {
      embed.addFields({ name: `Channel Overrides (${channels.length})`, value: chunked });
    } else {
      embed.addFields({ name: `Channel Overrides (${channels.length})`, value: chunked.slice(0, 1021) + "..." });
    }
  } else {
    embed.addFields({ name: "Channel Overrides", value: "None — all channels use guild defaults" });
  }

  embed.setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
