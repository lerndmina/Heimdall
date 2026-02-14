import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

export async function handleList(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction } = context;
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const panels = await api.roleButtonService.listPanels(guildId);
  if (panels.length === 0) {
    await interaction.reply({ content: "No role button panels exist yet.", ephemeral: true });
    return;
  }

  const lines = panels.slice(0, 20).map((panel) => `• **${panel.name}** — ${panel.buttons.length} buttons, ${panel.posts.length} posts`);
  await interaction.reply({
    content: `Role Button Panels (${panels.length})\n${lines.join("\n")}`,
    ephemeral: true,
  });
}
