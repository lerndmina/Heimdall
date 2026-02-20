/**
 * /ps2-info [user] — Display PlanetSide 2 character information
 *
 * Shows a rich embed with character stats, online status, outfit info.
 * Without a user argument: shows your own linked character.
 * With a user argument: shows that user's linked character.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import { getFactionEmoji, getFactionName, getFactionColor, getServerName, formatBattleRank, formatPlaytime, formatNumber } from "../utils/census-helpers.js";

export const data = new SlashCommandBuilder()
  .setName("ps2-info")
  .setDescription("View PlanetSide 2 character info")
  .addUserOption((opt) => opt.setName("user").setDescription("User to look up (defaults to yourself)").setRequired(false));

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Info",
  description: "View PlanetSide 2 character information",
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
  const targetUser = interaction.options.getUser("user") || interaction.user;

  const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
  if (!ps2Config?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("PlanetSide 2 integration is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const linkedPlayer = await PlanetSidePlayer.findOne({
    guildId,
    discordId: targetUser.id,
    linkedAt: { $ne: null },
  }).lean();

  if (!linkedPlayer) {
    const isSelf = targetUser.id === interaction.user.id;
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ No Account Linked")
      .setDescription(isSelf ? "You don't have a PlanetSide 2 account linked. Use `/ps2-link` to get started." : `${targetUser} doesn't have a PlanetSide 2 account linked.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Fetch live data
  const [honuChar, onlineStatus, charStats] = await Promise.all([
    pluginAPI.apiService.getCharacterById(linkedPlayer.characterId, ps2Config.honuBaseUrl ?? undefined),
    pluginAPI.apiService.getCharacterOnlineStatus(linkedPlayer.characterId, ps2Config.honuBaseUrl ?? undefined),
    pluginAPI.apiService.getCharacterStats(linkedPlayer.characterId, ps2Config.honuBaseUrl ?? undefined),
  ]);

  // Also try Census for cert data
  const censusChar = await pluginAPI.apiService.censusGetCharacterById(linkedPlayer.characterId, ps2Config.censusServiceId ?? undefined);

  const factionId = honuChar?.factionID ?? linkedPlayer.factionId ?? 0;
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setTitle(`${getFactionEmoji(factionId)} ${honuChar?.name ?? linkedPlayer.characterName}`)
    .setColor(getFactionColor(factionId));

  // Core info
  const br = honuChar?.battleRank ?? linkedPlayer.battleRank ?? 0;
  const prestige = honuChar?.prestige ?? linkedPlayer.prestige ?? 0;
  const serverId = honuChar?.worldID ?? linkedPlayer.serverId ?? 0;

  embed.addFields(
    { name: "Faction", value: getFactionName(factionId), inline: true },
    { name: "Battle Rank", value: formatBattleRank(br, prestige), inline: true },
    { name: "Server", value: getServerName(serverId), inline: true },
  );

  // Online status
  if (onlineStatus) {
    embed.addFields({
      name: "Status",
      value: onlineStatus.online ? "🟢 Online" : "🔴 Offline",
      inline: true,
    });
  }

  // Outfit info
  if (honuChar?.outfitTag || linkedPlayer.outfitTag) {
    const tag = honuChar?.outfitTag ?? linkedPlayer.outfitTag;
    const name = honuChar?.outfitName ?? linkedPlayer.outfitName ?? "";
    embed.addFields({
      name: "Outfit",
      value: tag ? `[${tag}] ${name}` : name || "None",
      inline: true,
    });
  }

  // Stats
  if (charStats) {
    const kd = charStats.kills && charStats.deaths ? (charStats.kills / Math.max(charStats.deaths, 1)).toFixed(2) : null;
    const statsLines: string[] = [];
    if (charStats.kills != null) statsLines.push(`**Kills:** ${formatNumber(charStats.kills)}`);
    if (charStats.deaths != null) statsLines.push(`**Deaths:** ${formatNumber(charStats.deaths)}`);
    if (kd) statsLines.push(`**K/D:** ${kd}`);
    if (charStats.score != null) statsLines.push(`**Score:** ${formatNumber(charStats.score)}`);
    if (charStats.playTime != null) statsLines.push(`**Playtime:** ${formatPlaytime(charStats.playTime)}`);

    if (statsLines.length > 0) {
      embed.addFields({ name: "📊 Stats", value: statsLines.join("\n"), inline: false });
    }
  }

  // Census-specific data (certs)
  if (censusChar?.certs) {
    const certs = censusChar.certs;
    embed.addFields({
      name: "🎓 Certifications",
      value:
        `**Available:** ${formatNumber(parseInt(certs.available_points))}\n` +
        `**Earned:** ${formatNumber(parseInt(certs.earned_points))}\n` +
        `**Gifted:** ${formatNumber(parseInt(certs.gifted_points))}\n` +
        `**Spent:** ${formatNumber(parseInt(certs.spent_points))}`,
      inline: true,
    });
  }

  if (censusChar?.times) {
    const loginCount = parseInt(censusChar.times.login_count);
    const minutesPlayed = parseInt(censusChar.times.minutes_played);
    const lastLogin = parseInt(censusChar.times.last_login);
    const lines: string[] = [];
    if (loginCount) lines.push(`**Logins:** ${formatNumber(loginCount)}`);
    if (minutesPlayed) lines.push(`**Playtime:** ${formatPlaytime(minutesPlayed)}`);
    if (lastLogin) lines.push(`**Last Login:** <t:${lastLogin}:R>`);
    if (lines.length > 0) {
      embed.addFields({ name: "📅 Activity", value: lines.join("\n"), inline: true });
    }
  }

  // Discord user
  embed.addFields({ name: "Discord", value: `${targetUser}`, inline: true });

  embed.setFooter({ text: `Character ID: ${linkedPlayer.characterId}` });
  embed.setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
