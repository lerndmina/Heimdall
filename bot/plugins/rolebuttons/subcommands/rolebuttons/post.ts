import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

export async function handlePost(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction } = context;
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const panelName = interaction.options.getString("panel", true);
  const panel = (await api.roleButtonService.listPanels(guildId)).find((p) => p.name.toLowerCase() === panelName.toLowerCase());
  if (!panel) {
    await interaction.reply({ content: `❌ Panel \`${panelName}\` not found.`, ephemeral: true });
    return;
  }

  const selectedChannel = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild.channels.fetch(selectedChannel.id);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: "❌ Please choose a text channel.", ephemeral: true });
    return;
  }

  try {
    await api.roleButtonService.postPanel(panel as any, channel, interaction.user.id, api.lib);
    broadcastDashboardChange(guildId, "rolebuttons", "panel_updated", { requiredAction: "rolebuttons.manage" });
    await interaction.reply({ content: `✅ Posted panel **${panel.name}** to <#${channel.id}>.`, ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: `❌ ${(error as Error).message || "Failed to post panel."}`, ephemeral: true });
  }
}
