/**
 * Main Menu Panel — Hub for navigating between dev panels.
 *
 * Shows a quick stats overview and a select menu for picking a sub-panel.
 */

import { ActionRowBuilder, StringSelectMenuOptionBuilder, type StringSelectMenuInteraction } from "discord.js";
import { PANEL_NAV_OPTIONS, PANEL_TTL, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { version as djsVersion } from "discord.js";
import { formatUptime, formatBytes } from "../devPanel.js";

export async function buildMainMenu(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib, client } = ctx;

  // ── Stats ────────────────────────────────────────────────────────────────
  const uptime = process.uptime();
  const mem = process.memoryUsage();
  const guilds = client.guilds.cache.size;
  const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🛡️ Heimdall Developer Panel")
    .setDescription("Select a panel below to manage bot systems.")
    .addFields(
      { name: "Uptime", value: formatUptime(uptime), inline: true },
      { name: "Guilds", value: String(guilds), inline: true },
      { name: "Users", value: users.toLocaleString(), inline: true },
      { name: "Memory", value: formatBytes(mem.heapUsed), inline: true },
      { name: "WS Ping", value: `${client.ws.ping}ms`, inline: true },
      { name: "discord.js", value: djsVersion, inline: true },
    );

  // ── Navigation Select Menu ──────────────────────────────────────────────
  const navSelect = ctx.lib
    .createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
      await i.deferUpdate();
      const panelId = i.values[0]!;
      await ctx.navigate(panelId);
    }, PANEL_TTL)
    .setPlaceholder("Select a panel…")
    .addOptions(PANEL_NAV_OPTIONS.map((opt) => new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value).setDescription(opt.description)));

  await navSelect.ready();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(navSelect)],
  };
}
