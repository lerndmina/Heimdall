/**
 * /automod stats — Show automod infraction statistics for this server.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";

export async function handleStats(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");

  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const stats = await mod.infractionService.getGuildStats(guildId);

  const embed = mod.lib.createEmbedBuilder().setTitle("📊 Moderation Statistics");

  embed.addFields(
    { name: "Total Infractions", value: String(stats.totalInfractions), inline: true },
    { name: "Active Infractions", value: String(stats.activeInfractions), inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
  );

  // Source breakdown
  if (Object.keys(stats.bySource).length > 0) {
    const sourceList = Object.entries(stats.bySource)
      .map(([source, count]) => `${source}: **${count}**`)
      .join("\n");
    embed.addFields({ name: "By Source", value: sourceList, inline: true });
  }

  // Type breakdown
  if (Object.keys(stats.byType).length > 0) {
    const typeList = Object.entries(stats.byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([type, count]) => `${type}: **${count}**`)
      .join("\n");
    embed.addFields({ name: "By Type", value: typeList, inline: true });
  }

  // Recent infractions
  if (stats.recentInfractions.length > 0) {
    const recent = stats.recentInfractions
      .slice(0, 5)
      .map((inf) => {
        const time = `<t:${Math.floor(new Date(inf.createdAt).getTime() / 1000)}:R>`;
        return `• <@${inf.userId}> — ${inf.type} (${inf.source}) ${time}`;
      })
      .join("\n");
    embed.addFields({ name: "Recent Infractions", value: recent });
  }

  await interaction.editReply({ embeds: [embed] });
}
