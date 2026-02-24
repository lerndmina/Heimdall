/**
 * Plugins Panel — Displays info about all loaded plugins, their events,
 * commands, and API routes.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  optionalDependencies?: string[];
  requiredEnv?: string[];
  optionalEnv?: string[];
  apiRoutePrefix?: string;
}

export async function buildPluginsPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib } = ctx;

  // ── Read manifests from disk ─────────────────────────────────────────────
  const pluginsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const manifests: PluginManifest[] = [];

  try {
    const dirs = await readdir(pluginsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const raw = await readFile(join(pluginsDir, d.name, "manifest.json"), "utf-8");
        manifests.push(JSON.parse(raw) as PluginManifest);
      } catch {
        // skip plugins without manifest
      }
    }
  } catch {
    // fallback if directory read fails
  }

  manifests.sort((a, b) => a.name.localeCompare(b.name));

  // ── Correlate with runtime data ──────────────────────────────────────────
  const eventStats = ctx.eventManager.getStats();
  const apiStats = ctx.apiManager.getStats();
  const allCommands = ctx.commandManager.getAllCommands();

  // Count commands per plugin
  const cmdsByPlugin: Record<string, number> = {};
  for (const cmd of allCommands.values()) {
    const pn = cmd.config.pluginName;
    cmdsByPlugin[pn] = (cmdsByPlugin[pn] ?? 0) + 1;
  }

  // ── Build embed fields ───────────────────────────────────────────────────
  const lines: string[] = [];
  for (const m of manifests) {
    const cmds = cmdsByPlugin[m.name] ?? 0;
    const events = eventStats.byPlugin[m.name] ?? 0;
    const routes = apiStats.byPlugin[m.name];
    const deps = m.dependencies?.length ? m.dependencies.join(", ") : "—";

    let info = `**${m.name}** v${m.version}`;
    info += `\n> ${m.description}`;
    info += `\n> Cmds: \`${cmds}\` · Events: \`${events}\``;
    if (routes && routes.length > 0) {
      info += ` · API: \`${m.apiRoutePrefix ?? routes.join(", ")}\``;
    }
    info += ` · Deps: \`${deps}\``;
    lines.push(info);
  }

  // Discord embed field value limit is 4096 for description
  const description = lines.length > 0 ? lines.join("\n\n") : "No plugins found.";

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🧩 Plugins")
    .setDescription(description.length > 4096 ? description.slice(0, 4090) + "\n..." : description)
    .setFooter({ text: `${manifests.length} plugins loaded` });

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.PLUGINS);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  await refreshBtn.ready();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn)],
  };
}
