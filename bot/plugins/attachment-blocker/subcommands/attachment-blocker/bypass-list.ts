/**
 * /attachment-blocker bypass list — List global bypass roles.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleBypassList(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const config = await pluginAPI.service.getGuildConfig(guildId);
  const bypassRoleIds = config?.bypassRoleIds ?? [];

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛡️ Global Bypass Roles")
    .setDescription(bypassRoleIds.length > 0 ? bypassRoleIds.map((id) => `<@&${id}>`).join("\n") : "No global bypass roles configured.")
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
