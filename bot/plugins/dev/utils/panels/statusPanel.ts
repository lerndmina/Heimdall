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
  const eventStats = ctx.eventManager.getStats();
  const apiStats = ctx.apiManager.getStats();
  const compStats = ctx.componentCallbackService.getStats();
  const wsStats = ctx.wsManager.getStats();

  // Discord cache stats
  const cachedUsers = client.users.cache.size;
  const cachedRoles = client.guilds.cache.reduce((acc, g) => acc + g.roles.cache.size, 0);
  const cachedEmojis = client.emojis.cache.size;

  const embed = lib
    .createEmbedBuilder()
    .setTitle("📊 Bot Status")
    .addFields(
      { name: "Uptime", value: formatUptime(uptime), inline: true },
      { name: "WS Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "Guilds", value: String(guilds), inline: true },
      { name: "Users (total)", value: users.toLocaleString(), inline: true },
      { name: "Channels", value: String(channels), inline: true },
      { name: "Commands", value: `${cmdStats.total} (${cmdStats.slashCommands} slash, ${cmdStats.contextMenuCommands} ctx)`, inline: true },
      { name: "Events", value: `${eventStats.total} listeners`, inline: true },
      { name: "API Routes", value: apiStats.routers > 0 ? `${apiStats.routers} routers` : "Not started", inline: true },
      { name: "Components", value: `${compStats.ephemeralCallbacks} ephemeral, ${compStats.persistentHandlers} persistent`, inline: true },
      { name: "WebSocket", value: wsStats.started ? `${wsStats.totalClients} clients, ${wsStats.guildRooms} rooms` : "Not started", inline: true },
      { name: "Heap", value: `${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`, inline: true },
      { name: "RSS", value: formatBytes(mem.rss), inline: true },
      { name: "Discord Cache", value: `${cachedUsers} users, ${cachedRoles} roles, ${cachedEmojis} emojis`, inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "discord.js", value: djsVersion, inline: true },
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
