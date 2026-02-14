import type { TextBasedChannel } from "discord.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

export async function handleDelete(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction } = context;
  const guildId = interaction.guildId;
  if (!guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const panelName = interaction.options.getString("panel", true);
  const deletePosts = interaction.options.getBoolean("delete_posts") ?? false;
  const panel = (await api.roleButtonService.listPanels(guildId)).find((p) => p.name.toLowerCase() === panelName.toLowerCase());
  if (!panel) {
    await interaction.reply({ content: `❌ Panel \`${panelName}\` not found.`, ephemeral: true });
    return;
  }

  if (deletePosts) {
    for (const post of panel.posts ?? []) {
      try {
        const channel = await interaction.guild.channels.fetch(post.channelId);
        if (channel?.isTextBased()) {
          const msg = await (channel as TextBasedChannel).messages.fetch(post.messageId);
          await msg.delete().catch(() => null);
        }
      } catch {
        // ignore
      }
    }
  }

  await api.roleButtonService.deletePanel(guildId, panel.id);
  broadcastDashboardChange(guildId, "rolebuttons", "panel_deleted", { requiredAction: "rolebuttons.manage" });
  await interaction.reply({ content: `✅ Deleted panel **${panel.name}**.`, ephemeral: true });
}
