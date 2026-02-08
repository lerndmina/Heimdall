/**
 * /attachment-blocker channel add — Add or update a per-channel override.
 */

import { ChannelType, type TextChannel } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";
import { AttachmentType, AttachmentTypeLabels } from "../../utils/attachment-types.js";

export async function handleChannelAdd(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel("channel", true);
  const type = interaction.options.getString("type", true) as AttachmentType;
  const timeoutSeconds = interaction.options.getInteger("timeout");
  const timeoutDuration = timeoutSeconds !== null ? timeoutSeconds * 1000 : undefined;

  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement && channel.type !== ChannelType.GuildVoice) {
    await interaction.editReply("❌ The channel must be a text, announcement, or voice channel.");
    return;
  }

  if (!Object.values(AttachmentType).includes(type)) {
    await interaction.editReply("❌ Invalid attachment type.");
    return;
  }

  const guildId = interaction.guildId!;

  // Get existing channel config to merge types
  const existing = await pluginAPI.service.getChannelConfig(channel.id);
  let allowedTypes: AttachmentType[];

  if (type === AttachmentType.ALL || type === AttachmentType.NONE) {
    allowedTypes = [type];
  } else if (existing?.allowedTypes) {
    const currentTypes = (existing.allowedTypes as AttachmentType[]).filter((t) => t !== AttachmentType.ALL && t !== AttachmentType.NONE);
    if (currentTypes.includes(type)) {
      await interaction.editReply(`ℹ️ **${AttachmentTypeLabels[type]}** is already whitelisted in ${channel}.`);
      return;
    }
    allowedTypes = [...currentTypes, type];
  } else {
    allowedTypes = [type];
  }

  const config = await pluginAPI.service.upsertChannelConfig(guildId, channel.id, {
    allowedTypes,
    timeoutDuration,
    createdBy: interaction.user.id,
  });

  // Set channel permission overrides
  try {
    const textChannel = channel as unknown as TextChannel;
    await textChannel.permissionOverwrites.edit(textChannel.guild.roles.everyone, {
      AttachFiles: true,
    });
  } catch {
    // Non-critical, log only
  }

  const typesDisplay = (config.allowedTypes as AttachmentType[]).map((t) => AttachmentTypeLabels[t] ?? t).join(", ");

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Channel Override Set")
    .setDescription(`Attachment blocking override configured for ${channel}.`)
    .addFields(
      { name: "Whitelisted Types", value: typesDisplay || "Inherits guild default", inline: true },
      {
        name: "Timeout",
        value: config.timeoutDuration !== undefined && config.timeoutDuration !== null ? `${(config.timeoutDuration as number) / 1000}s` : "Inherits guild default",
        inline: true,
      },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
