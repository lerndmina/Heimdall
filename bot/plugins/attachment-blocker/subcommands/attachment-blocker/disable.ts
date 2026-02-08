/**
 * /attachment-blocker disable — Disable attachment blocking guild-wide.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleDisable(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const guildConfig = await pluginAPI.service.getGuildConfig(guildId);

  if (!guildConfig || !guildConfig.enabled) {
    await interaction.editReply("ℹ️ Attachment blocking is already disabled.");
    return;
  }

  await pluginAPI.service.updateGuildConfig(guildId, { enabled: false });

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0xff4444)
    .setTitle("🛑 Attachment Blocker Disabled")
    .setDescription("Attachment blocking has been disabled guild-wide.\nChannel overrides are preserved but inactive. Use `/attachment-blocker setup` to re-enable.")
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
