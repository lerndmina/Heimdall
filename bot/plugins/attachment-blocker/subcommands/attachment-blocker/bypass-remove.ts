/**
 * /attachment-blocker bypass remove — Remove a global bypass role.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { AttachmentBlockerPluginAPI } from "../../index.js";

export async function handleBypassRemove(context: CommandContext, pluginAPI: AttachmentBlockerPluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const role = interaction.options.getRole("role", true);
  const guildId = interaction.guildId!;

  const config = await pluginAPI.service.getGuildConfig(guildId);
  const existingBypass = config?.bypassRoleIds ?? [];

  if (!existingBypass.includes(role.id)) {
    await interaction.editReply(`ℹ️ ${role} is not currently a global bypass role.`);
    return;
  }

  const bypassRoleIds = existingBypass.filter((id) => id !== role.id);
  await pluginAPI.service.updateGuildConfig(guildId, { bypassRoleIds });

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Global Bypass Role Removed")
    .setDescription(`${role} no longer bypasses attachment-blocker checks globally.`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  broadcastDashboardChange(guildId, "attachment-blocker", "config_updated", { requiredAction: "attachment-blocker.manage_config" });
}
