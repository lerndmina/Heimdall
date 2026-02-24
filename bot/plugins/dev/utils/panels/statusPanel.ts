/**
 * Bot Status Panel — Detailed runtime information about the bot.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { version as djsVersion } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, formatUptime, formatBytes, type DevPanelContext, type PanelResult } from "../devPanel.js";

export async function buildStatusPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib, client } = ctx;

  // ── Gather stats ─────────────────────────────────────────────────────────
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const guilds = client.guilds.cache.size;
  const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
  const channels = client.channels.cache.size;
  const cmdStats = ctx.commandManager.getStats();

  const embed = lib
    .createEmbedBuilder()
    .setTitle("📊 Bot Status")
    .addFields(
      { name: "Uptime", value: formatUptime(uptime), inline: true },
      { name: "WS Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "Guilds", value: String(guilds), inline: true },
      { name: "Users", value: users.toLocaleString(), inline: true },
      { name: "Channels", value: String(channels), inline: true },
      { name: "Commands", value: `${cmdStats.total} (${cmdStats.slashCommands} slash, ${cmdStats.contextMenuCommands} ctx)`, inline: true },
      { name: "Heap", value: `${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`, inline: true },
      { name: "RSS", value: formatBytes(mem.rss), inline: true },
      { name: "External", value: formatBytes(mem.external), inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "discord.js", value: djsVersion, inline: true },
      { name: "Platform", value: `${process.platform} ${process.arch}`, inline: true },
      { name: "PID", value: String(process.pid), inline: true },
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.STATUS);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  await refreshBtn.ready();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn)],
  };
}
