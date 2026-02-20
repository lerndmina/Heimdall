/**
 * /ps2-promote — List members needing promotion in PS2
 *
 * Shows members with the configured "promotion" role,
 * cross-referenced with online outfit members via Honu.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";

export const data = new SlashCommandBuilder().setName("ps2-promote").setDescription("List members needing PS2 outfit promotion");

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Promote",
  description: "View members needing outfit promotion",
  defaultAllow: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<PlanetSidePluginAPI>("planetside");
  if (!pluginAPI) {
    await interaction.editReply("❌ PlanetSide plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();

  if (!ps2Config?.enabled || !ps2Config.roles?.promotion) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Not Configured")
      .setDescription("PlanetSide 2 must be enabled and a promotion role must be set.\nUse `/ps2-setup roles` to configure.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Get members with promotion role
  const guild = await pluginAPI.lib.thingGetter.getGuild(guildId);
  if (!guild) {
    await interaction.editReply("❌ Could not fetch guild.");
    return;
  }

  const promotionRoleId = ps2Config.roles.promotion;
  await guild.members.fetch();
  const membersWithRole = guild.members.cache.filter((m) => m.roles.cache.has(promotionRoleId));

  if (membersWithRole.size === 0) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ No Promotions Needed").setDescription("No members currently have the promotion role.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Get linked characters for those members
  const memberIds = membersWithRole.map((m) => m.id);
  const linkedPlayers = await PlanetSidePlayer.find({
    guildId,
    discordId: { $in: memberIds },
    linkedAt: { $ne: null },
  }).lean();

  // Check online status for outfit members
  let onlineCharIds: Set<string> = new Set();
  if (ps2Config.outfitId) {
    const onlineMembers = await pluginAPI.apiService.getOutfitOnline(ps2Config.outfitId, ps2Config.honuBaseUrl);
    if (onlineMembers) {
      onlineCharIds = new Set(onlineMembers.map((m) => m.id));
    }
  }

  const lines: string[] = [];

  for (const [, member] of membersWithRole) {
    const player = linkedPlayers.find((p) => p.discordId === member.id);
    const isOnline = player ? onlineCharIds.has(player.characterId) : false;

    const statusIcon = isOnline ? "🟢" : player ? "🔴" : "❓";
    const charName = player?.characterName ?? "Not linked";
    lines.push(`${statusIcon} ${member} — ${charName}${isOnline ? " **(ONLINE)**" : ""}`);
  }

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setTitle("📋 Members Needing Promotion")
    .setColor(0xffa500)
    .setDescription(lines.join("\n") || "No members found.")
    .setFooter({ text: `${membersWithRole.size} member(s) • 🟢 = online in PS2` });

  await interaction.editReply({ embeds: [embed] });
}
