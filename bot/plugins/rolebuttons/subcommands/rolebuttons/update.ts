import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

export async function handleUpdate(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction, client } = context;
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const panelName = interaction.options.getString("panel", true);
  const panel = (await api.roleButtonService.listPanels(guildId)).find((p) => p.name.toLowerCase() === panelName.toLowerCase());
  if (!panel) {
    await interaction.reply({ content: `❌ Panel \`${panelName}\` not found.`, ephemeral: true });
    return;
  }

  const result = await api.roleButtonService.updatePostedPanels(panel as any, client, api.lib);
  broadcastDashboardChange(guildId, "rolebuttons", "panel_updated", { requiredAction: "rolebuttons.manage" });

  await interaction.reply({
    content: `✅ Updated **${result.updated}** posted message(s). Removed **${result.removed}** stale post record(s).`,
    ephemeral: true,
  });
}
