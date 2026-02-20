/**
 * /ps2-link [character] — PlanetSide 2 account management panel
 *
 * Without a character name: shows the interactive account manager panel.
 * With a character name: starts the link flow directly.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext, AutocompleteContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import { showAccountPanel } from "../utils/accountPanel.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

const log = createLogger("planetside:link");

export const data = new SlashCommandBuilder()
  .setName("ps2-link")
  .setDescription("Link your PlanetSide 2 account to Discord")
  .addStringOption((opt) => opt.setName("character").setDescription("Your PS2 character name (or leave blank to open the panel)").setRequired(false).setAutocomplete(true));

export const config = { allowInDMs: false };

export const permissions = {
  label: "Link PS2 Account",
  description: "Link a PlanetSide 2 character to your Discord account",
  defaultAllow: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<PlanetSidePluginAPI>("planetside");
  if (!pluginAPI) {
    await interaction.editReply("❌ PlanetSide plugin not loaded.");
    return;
  }

  const characterName = interaction.options.getString("character")?.trim();

  if (!characterName) {
    await showAccountPanel(interaction, pluginAPI.lib, pluginAPI.apiService);
    return;
  }

  // ── Character name provided — direct link flow ─────────────────

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
  if (!ps2Config?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("PlanetSide 2 account linking is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Check if already linked
  const existingLink = await PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();
  if (existingLink) {
    await showAccountPanel(interaction, pluginAPI.lib, pluginAPI.apiService);
    return;
  }

  // Look up character
  const character = await pluginAPI.apiService.findCharacterByName(characterName, {
    honuBaseUrl: ps2Config.honuBaseUrl ?? undefined,
    censusServiceId: ps2Config.censusServiceId ?? undefined,
  });

  if (!character) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Character Not Found").setDescription(`Could not find a PlanetSide 2 character named **${characterName}**.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Check if taken
  const taken = await PlanetSidePlayer.findOne({
    guildId,
    characterId: character.characterId,
    discordId: { $ne: discordId },
    linkedAt: { $ne: null },
  }).lean();

  if (taken) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Character Taken").setDescription(`**${character.characterName}** is already linked to another Discord account.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Create pending link
  const member = await interaction.guild?.members.fetch(discordId).catch(() => null);

  try {
    await PlanetSidePlayer.findOneAndUpdate(
      { guildId, characterId: character.characterId },
      {
        $set: {
          guildId,
          discordId,
          characterId: character.characterId,
          characterName: character.characterName,
          factionId: character.factionId,
          serverId: character.serverId,
          battleRank: character.battleRank,
          prestige: character.prestige,
          outfitId: character.outfitId,
          outfitTag: character.outfitTag,
          discordUsername: interaction.user.username,
          discordDisplayName: member?.displayName || interaction.user.globalName || interaction.user.username,
          verificationStartedAt: new Date(),
          verificationMethod: ps2Config.verificationMethod || "online_now",
          source: "linked",
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    log.error("Failed to create pending link:", error);
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Error").setDescription("Failed to create link request. Please try again.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  broadcastDashboardChange(guildId, "planetside", "link_requested", { requiredAction: "planetside.view_players" });

  await showAccountPanel(interaction, pluginAPI.lib, pluginAPI.apiService);
}

/** Autocomplete handler for character name search */
export async function autocomplete(context: AutocompleteContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  const pluginAPI = getPluginAPI<PlanetSidePluginAPI>("planetside");
  if (!pluginAPI) {
    await interaction.respond([]);
    return;
  }

  const focusedValue = interaction.options.getFocused();
  if (focusedValue.length < 2) {
    await interaction.respond([]);
    return;
  }

  try {
    const ps2Config = await PlanetSideConfig.findOne({ guildId: interaction.guildId }).lean();
    const results = await pluginAPI.apiService.searchCharacter(focusedValue, ps2Config?.honuBaseUrl ?? undefined);

    const choices = results.slice(0, 25).map((char) => ({
      name: `${char.name} (BR${char.battleRank}${char.prestige ? ` ASP${char.prestige}` : ""})`,
      value: char.name,
    }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}
