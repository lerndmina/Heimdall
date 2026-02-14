import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

export async function handleCreate(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction } = context;
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const name = interaction.options.getString("name", true).trim();
  try {
    const panel = await api.roleButtonService.createPanel(guildId, name, interaction.user.id);

    broadcastDashboardChange(guildId, "rolebuttons", "panel_created", { requiredAction: "rolebuttons.manage" });

    await interaction.reply({
      content: `✅ Created panel **${panel.name}**. Use \`/rolebuttons edit panel:${panel.name}\` then \`/rolebuttons post\`.`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: `❌ ${(error as Error).message || "Failed to create panel."}`,
      ephemeral: true,
    });
  }
}
