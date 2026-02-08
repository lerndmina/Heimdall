/**
 * /attachment-blocker setup — Configure guild-wide defaults.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";
import { AttachmentType, AttachmentTypeLabels } from "../../utils/attachment-types.js";

export async function handleSetup(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const type = interaction.options.getString("type", true) as AttachmentType;
  const timeoutSeconds = interaction.options.getInteger("timeout") ?? 0;
  const timeoutDuration = timeoutSeconds * 1000;

  if (!Object.values(AttachmentType).includes(type)) {
    await interaction.editReply("❌ Invalid attachment type.");
    return;
  }

  const guildId = interaction.guildId!;

  // Get existing config to merge types
  const existing = await pluginAPI.service.getGuildConfig(guildId);
  let allowedTypes: AttachmentType[];

  if (type === AttachmentType.ALL || type === AttachmentType.NONE) {
    // ALL and NONE replace any existing types
    allowedTypes = [type];
  } else if (existing?.defaultAllowedTypes) {
    // Add to existing types (remove ALL/NONE if present)
    const currentTypes = (existing.defaultAllowedTypes as AttachmentType[]).filter((t) => t !== AttachmentType.ALL && t !== AttachmentType.NONE);
    if (currentTypes.includes(type)) {
      await interaction.editReply(`ℹ️ **${AttachmentTypeLabels[type]}** is already whitelisted guild-wide.`);
      return;
    }
    allowedTypes = [...currentTypes, type];
  } else {
    allowedTypes = [type];
  }

  const config = await pluginAPI.service.updateGuildConfig(guildId, {
    enabled: true,
    defaultAllowedTypes: allowedTypes,
    defaultTimeoutDuration: timeoutDuration,
  });

  const typesDisplay = (config.defaultAllowedTypes as AttachmentType[]).map((t) => AttachmentTypeLabels[t] ?? t).join(", ");

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Attachment Blocker Configured")
    .setDescription("Guild-wide attachment blocking has been enabled.")
    .addFields(
      { name: "Whitelisted Types", value: typesDisplay || "None", inline: true },
      {
        name: "Timeout",
        value: timeoutDuration > 0 ? `${timeoutSeconds}s` : "Disabled",
        inline: true,
      },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
