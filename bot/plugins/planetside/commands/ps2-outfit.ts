/**
 * /ps2-outfit — View outfit information
 *
 * Shows outfit overview: name, tag, member count, online count, activity.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import { getFactionEmoji, getFactionName, getServerName } from "../utils/census-helpers.js";

export const data = new SlashCommandBuilder()
  .setName("ps2-outfit")
  .setDescription("View PlanetSide 2 outfit information")
  .addStringOption((opt) => opt.setName("tag").setDescription("Outfit tag to look up (defaults to server's configured outfit)").setRequired(false));

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Outfit",
  description: "View PlanetSide 2 outfit information",
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

  const outfitTag = interaction.options.getString("tag")?.trim().toUpperCase();
  let outfitId = ps2Config?.outfitId;

  // If tag provided, resolve it
  if (outfitTag) {
    const outfits = await pluginAPI.apiService.getOutfitByTag(outfitTag, ps2Config?.honuBaseUrl);
    if (!outfits || outfits.length === 0) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Outfit Not Found").setDescription(`Could not find an outfit with tag **[${outfitTag}]**.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    outfitId = outfits[0]!.id;
  } else if (!outfitId) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ No Outfit Configured")
      .setDescription("No outfit is configured for this server. Use `/ps2-outfit <tag>` to look up an outfit.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Fetch outfit data
  const [outfit, onlineMembers] = await Promise.all([pluginAPI.apiService.getOutfit(outfitId!, ps2Config?.honuBaseUrl), pluginAPI.apiService.getOutfitOnline(outfitId!, ps2Config?.honuBaseUrl)]);

  if (!outfit) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Outfit Not Found").setDescription("Could not fetch outfit information.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const onlineCount = onlineMembers?.length ?? 0;

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setTitle(`${getFactionEmoji(outfit.factionID)} [${outfit.tag}] ${outfit.name}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "Faction", value: getFactionName(outfit.factionID), inline: true },
      { name: "Server", value: getServerName(outfit.worldID), inline: true },
      { name: "Members", value: `${outfit.memberCount ?? "Unknown"}`, inline: true },
      { name: "Online Now", value: `${onlineCount}`, inline: true },
    )
    .setTimestamp();

  // Show online members if not too many
  if (onlineMembers && onlineMembers.length > 0 && onlineMembers.length <= 30) {
    const memberList = onlineMembers.map((m) => `• ${m.name}`).join("\n");
    embed.addFields({
      name: `🟢 Online Members (${onlineCount})`,
      value: memberList.length > 1024 ? memberList.slice(0, 1020) + "..." : memberList,
      inline: false,
    });
  } else if (onlineMembers && onlineMembers.length > 30) {
    embed.addFields({
      name: `🟢 Online Members (${onlineCount})`,
      value: `Too many to display. ${onlineCount} members currently online.`,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
