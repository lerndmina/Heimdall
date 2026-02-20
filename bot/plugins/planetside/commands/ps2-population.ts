/**
 * /ps2-population [server] [zones] — PlanetSide 2 world population
 *
 * Shows current server populations with faction breakdowns.
 * Optionally shows per-zone breakdowns.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import { FACTION_EMOJI, SERVER_NAMES } from "../utils/census-helpers.js";
import { ALL_WORLD_IDS } from "../services/PlanetSideApiService.js";

export const data = new SlashCommandBuilder()
  .setName("ps2-population")
  .setDescription("View PlanetSide 2 server populations")
  .addStringOption((opt) =>
    opt
      .setName("server")
      .setDescription("Specific server to show (defaults to all)")
      .setRequired(false)
      .addChoices({ name: "Connery", value: "1" }, { name: "Miller", value: "10" }, { name: "Cobalt", value: "13" }, { name: "Emerald", value: "17" }, { name: "SolTech", value: "40" }),
  )
  .addBooleanOption((opt) => opt.setName("zones").setDescription("Show per-zone breakdown (single server only)").setRequired(false));

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Population",
  description: "View PlanetSide 2 server populations",
  defaultAllow: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply();

  const pluginAPI = getPluginAPI<PlanetSidePluginAPI>("planetside");
  if (!pluginAPI) {
    await interaction.editReply("❌ PlanetSide plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();

  const serverFilter = interaction.options.getString("server");
  const showZones = interaction.options.getBoolean("zones") ?? false;

  const populationSource = (ps2Config?.populationSource as "honu" | "fisu") || "honu";
  const populations = await pluginAPI.apiService.getPopulation(populationSource, ps2Config?.honuBaseUrl);

  if (!populations || populations.length === 0) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Population Data Unavailable").setDescription("Failed to fetch population data. The API may be offline.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = pluginAPI.lib.createEmbedBuilder().setTitle("🌍 PlanetSide 2 Population").setColor(0x5865f2).setTimestamp();

  const filteredPops = serverFilter ? populations.filter((p) => String(p.worldID) === serverFilter) : populations;

  let totalPlayers = 0;

  for (const pop of filteredPops) {
    const serverName = pop.worldName || SERVER_NAMES[pop.worldID] || `World ${pop.worldID}`;
    const total = pop.total || pop.vs + pop.nc + pop.tr + pop.ns;
    totalPlayers += total;

    const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");

    embed.addFields({
      name: `${serverName} — ${total} online`,
      value:
        `${FACTION_EMOJI[1]} VS: **${pop.vs}** (${pct(pop.vs)}%)\n` +
        `${FACTION_EMOJI[2]} NC: **${pop.nc}** (${pct(pop.nc)}%)\n` +
        `${FACTION_EMOJI[3]} TR: **${pop.tr}** (${pct(pop.tr)}%)\n` +
        `${FACTION_EMOJI[4]} NSO: **${pop.ns}** (${pct(pop.ns)}%)`,
      inline: filteredPops.length > 1,
    });
  }

  if (filteredPops.length > 1) {
    embed.setDescription(`**Total across all servers: ${totalPlayers}**`);
  }

  embed.setFooter({ text: `Source: ${populationSource === "honu" ? "Honu (wt.honu.pw)" : "Fisu (ps2.fisu.pw)"}` });

  // Zone breakdown for single server
  if (showZones && serverFilter) {
    const worldId = parseInt(serverFilter);
    const zones = await pluginAPI.apiService.getZonePopulation(worldId, ps2Config?.honuBaseUrl);

    if (zones && zones.length > 0) {
      const zoneLines = zones.map((z) => {
        const total = z.vs + z.nc + z.tr + z.ns;
        return (
          `**${z.zoneName || `Zone ${z.zoneID}`}** — ${total} players\n` + `  ${FACTION_EMOJI[1]} ${z.vs} | ${FACTION_EMOJI[2]} ${z.nc} | ${FACTION_EMOJI[3]} ${z.tr} | ${FACTION_EMOJI[4]} ${z.ns}`
        );
      });

      embed.addFields({
        name: "📍 Zone Breakdown",
        value: zoneLines.join("\n\n") || "No zone data available",
        inline: false,
      });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}
