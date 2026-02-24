/**
 * Commands Panel — Refresh or delete all slash commands with real-time progress.
 *
 * After "Delete All", the /dev command is immediately re-registered to the
 * current guild so the owner can still access the panel.
 */

import { ActionRowBuilder, ButtonStyle, REST, Routes, type ButtonInteraction } from "discord.js";
import { createBackButton, requireConfirmation, PANEL_TTL, PanelId, type DevPanelContext, type PanelResult } from "../devPanel.js";

export async function buildCommandsPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib, client, commandManager } = ctx;

  // ── Gather command stats ─────────────────────────────────────────────────
  const stats = commandManager.getStats();
  const guildCount = client.guilds.cache.size;

  const embed = lib
    .createEmbedBuilder()
    .setTitle("⚡ Commands")
    .addFields(
      { name: "Total Commands", value: String(stats.total), inline: true },
      { name: "Slash Commands", value: String(stats.slashCommands), inline: true },
      { name: "Context Menu", value: String(stats.contextMenuCommands), inline: true },
      { name: "Guilds", value: String(guildCount), inline: true },
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();

      const progressMsg = await ctx.originalInteraction.followUp({
        content: `🔄 Refreshing commands to ${guildCount} guild(s)…`,
        ephemeral: true,
      });

      try {
        await commandManager.registerAllCommandsToGuilds();
        const newStats = commandManager.getStats();
        await progressMsg.edit(`✅ Refreshed **${newStats.total}** command(s) to **${client.guilds.cache.size}** guild(s).`);
      } catch (err) {
        await progressMsg.edit(`❌ Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }

      await ctx.navigate(PanelId.COMMANDS);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh All")
    .setStyle(ButtonStyle.Primary);

  const deleteBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const confirmed = await requireConfirmation(
        i,
        "Delete All Commands",
        "DELETE ALL",
        "This will delete ALL commands from ALL guilds and globally, then re-register /dev to this guild.",
      );
      if (!confirmed) return;

      const clientId = client.user?.id;
      if (!clientId) {
        await ctx.originalInteraction.followUp({ content: "❌ Client not ready.", ephemeral: true });
        return;
      }

      const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || "");
      const progressMsg = await ctx.originalInteraction.followUp({ content: "🗑️ Deleting commands…", ephemeral: true });

      let guildSuccess = 0;
      let guildFail = 0;
      const totalGuilds = client.guilds.cache.size;

      // Delete from all guilds
      for (const [guildId, guild] of client.guilds.cache) {
        try {
          await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
          guildSuccess++;
          // Real-time progress
          if (guildSuccess % 5 === 0 || guildSuccess === totalGuilds) {
            await progressMsg.edit(`🗑️ Deleting commands… ${guildSuccess}/${totalGuilds} guilds`).catch(() => {});
          }
        } catch {
          guildFail++;
        }
      }

      // Delete global commands
      try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
      } catch {
        // Non-critical
      }

      // Re-register /dev to the current guild so owner retains panel access
      const currentGuildId = ctx.originalInteraction.guildId;
      if (currentGuildId) {
        try {
          await commandManager.registerCommandsToGuild(currentGuildId);
          await progressMsg.edit(
            `✅ Deleted commands from **${guildSuccess}/${totalGuilds}** guilds` +
              (guildFail > 0 ? ` (${guildFail} failed)` : "") +
              `\n✅ Deleted global commands\n🔄 Re-registered all commands to this guild.`,
          );
        } catch {
          await progressMsg.edit(
            `✅ Deleted commands from **${guildSuccess}/${totalGuilds}** guilds` +
              (guildFail > 0 ? ` (${guildFail} failed)` : "") +
              `\n✅ Deleted global commands\n⚠️ Failed to re-register commands to this guild.`,
          );
        }
      }

      await ctx.navigate(PanelId.COMMANDS);
    }, PANEL_TTL)
    .setLabel("🗑️ Delete All")
    .setStyle(ButtonStyle.Danger);

  await Promise.all([refreshBtn.ready(), deleteBtn.ready()]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn, deleteBtn)],
  };
}
