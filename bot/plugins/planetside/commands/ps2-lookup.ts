/**
 * /ps2-lookup <user> [yeet] [add] — Admin character management
 *
 * Look up a user's linked PS2 account, remove ("yeet") it, or manually add one.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from "discord.js";
import type { CommandContext, AutocompleteContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import { getFactionEmoji, getServerName, formatBattleRank } from "../utils/census-helpers.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import { nanoid } from "nanoid";

const log = createLogger("planetside:lookup");

export const data = new SlashCommandBuilder()
  .setName("ps2-lookup")
  .setDescription("Admin: Look up or manage a user's PS2 link")
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View a user's linked PS2 character")
      .addUserOption((opt) => opt.setName("user").setDescription("The Discord user to look up").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("yeet")
      .setDescription("Remove a user's PS2 link")
      .addUserOption((opt) => opt.setName("user").setDescription("The Discord user to unlink").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Manually link a PS2 character to a Discord user")
      .addUserOption((opt) => opt.setName("user").setDescription("The Discord user").setRequired(true))
      .addStringOption((opt) => opt.setName("character").setDescription("PS2 character name").setRequired(true).setAutocomplete(true)),
  );

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Admin Lookup",
  description: "Manage users' PlanetSide 2 account links",
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
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "view") {
    const targetUser = interaction.options.getUser("user", true);

    const player = await PlanetSidePlayer.findOne({
      guildId,
      discordId: targetUser.id,
    }).lean();

    if (!player) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Found").setDescription(`${targetUser} does not have a linked PlanetSide 2 account.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle(`🔍 PS2 Lookup: ${player.characterName}`)
      .setColor(player.linkedAt ? 0x00ff00 : player.revokedAt ? 0xff0000 : 0xffa500)
      .addFields(
        { name: "Discord User", value: `${targetUser}`, inline: true },
        { name: "Character", value: `${getFactionEmoji(player.factionId ?? 0)} ${player.characterName}`, inline: true },
        { name: "Character ID", value: player.characterId, inline: true },
        { name: "Battle Rank", value: formatBattleRank(player.battleRank || 0, player.prestige || 0), inline: true },
        { name: "Server", value: getServerName(player.serverId || 0), inline: true },
      );

    if (player.linkedAt) {
      embed.addFields({ name: "Linked", value: `<t:${Math.floor(new Date(player.linkedAt).getTime() / 1000)}:R>`, inline: true });
    }
    if (player.revokedAt) {
      embed.addFields(
        { name: "Revoked", value: `<t:${Math.floor(new Date(player.revokedAt).getTime() / 1000)}:R>`, inline: true },
        { name: "Revoked By", value: player.revokedBy || "Unknown", inline: true },
        { name: "Reason", value: player.revocationReason || "No reason specified", inline: true },
      );
    }
    if (player.outfitTag) {
      embed.addFields({ name: "Outfit", value: `[${player.outfitTag}] ${player.outfitName || ""}`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "yeet") {
    const targetUser = interaction.options.getUser("user", true);

    const player = await PlanetSidePlayer.findOne({
      guildId,
      discordId: targetUser.id,
    });

    if (!player) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Found").setDescription(`${targetUser} does not have a linked PlanetSide 2 account.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const characterName = player.characterName;

    // Confirm with a button
    const confirmBtn = pluginAPI.lib.createButtonBuilder(async (btnI) => {
      await PlanetSidePlayer.findByIdAndDelete(player._id);

      broadcastDashboardChange(guildId, "planetside", "player_unlinked", { requiredAction: "planetside.view_players" });

      // Remove roles
      try {
        const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
        const guild = await pluginAPI.lib.thingGetter.getGuild(guildId);
        if (guild && ps2Config) {
          const member = await pluginAPI.lib.thingGetter.getMember(guild, targetUser.id);
          if (member) {
            const rolesToRemove = [ps2Config.roles?.member, ps2Config.roles?.guest].filter(Boolean) as string[];
            for (const roleId of rolesToRemove) {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId).catch(() => {});
              }
            }
          }
        }
      } catch {
        // Role removal failed
      }

      const doneEmbed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Account Unlinked").setDescription(`**${characterName}** has been unlinked from ${targetUser}.`);
      await btnI.update({ embeds: [doneEmbed], components: [] });

      log.info(`${interaction.user.tag} yeeted PS2 link for ${targetUser.tag}: ${characterName}`);
    }, 120);
    confirmBtn.setLabel("Yes, Remove").setStyle(4 /* Danger */);
    await confirmBtn.ready();

    const cancelBtn = pluginAPI.lib.createButtonBuilder(async (btnI) => {
      await btnI.update({ content: "Cancelled.", embeds: [], components: [] });
    }, 120);
    cancelBtn.setLabel("Cancel").setStyle(2 /* Secondary */);
    await cancelBtn.ready();

    const row = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("⚠️ Confirm Removal").setDescription(`Remove the PS2 link for **${characterName}** (${targetUser})?`);
    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  if (subcommand === "add") {
    const targetUser = interaction.options.getUser("user", true);
    const characterName = interaction.options.getString("character", true).trim();

    // Look up character
    const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
    const character = await pluginAPI.apiService.findCharacterByName(characterName, {
      honuBaseUrl: ps2Config?.honuBaseUrl ?? undefined,
      censusServiceId: ps2Config?.censusServiceId ?? undefined,
    });

    if (!character) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Character Not Found").setDescription(`Could not find **${characterName}** in PlanetSide 2.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if already linked
    const existing = await PlanetSidePlayer.findOne({
      guildId,
      characterId: character.characterId,
      linkedAt: { $ne: null },
    }).lean();

    if (existing) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Already Linked").setDescription(`**${character.characterName}** is already linked to <@${existing.discordId}>.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    await PlanetSidePlayer.findOneAndUpdate(
      { guildId, characterId: character.characterId },
      {
        $set: {
          guildId,
          discordId: targetUser.id,
          characterId: character.characterId,
          characterName: character.characterName,
          factionId: character.factionId,
          serverId: character.serverId,
          battleRank: character.battleRank,
          prestige: character.prestige,
          outfitId: character.outfitId,
          outfitTag: character.outfitTag,
          discordUsername: targetUser.username,
          discordDisplayName: member?.displayName || targetUser.globalName || targetUser.username,
          linkedAt: new Date(),
          verifiedAt: new Date(),
          verificationMethod: "manual",
          source: "admin",
        },
      },
      { upsert: true, new: true },
    );

    // Assign roles
    if (ps2Config && member) {
      if (ps2Config.roles?.member && ps2Config.outfitId && character.outfitId === ps2Config.outfitId) {
        await member.roles.add(ps2Config.roles.member).catch(() => {});
      }
      if (ps2Config.roles?.guest && (!ps2Config.outfitId || character.outfitId !== ps2Config.outfitId)) {
        await member.roles.add(ps2Config.roles.guest).catch(() => {});
      }
    }

    broadcastDashboardChange(guildId, "planetside", "player_linked", { requiredAction: "planetside.view_players" });

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Account Linked")
      .setDescription(
        `${getFactionEmoji(character.factionId)} **${character.characterName}** has been linked to ${targetUser}.\n\n` +
          `**Battle Rank:** ${formatBattleRank(character.battleRank, character.prestige)}\n` +
          `**Server:** ${getServerName(character.serverId)}`,
      );
    await interaction.editReply({ embeds: [embed] });

    log.info(`${interaction.user.tag} manually linked ${targetUser.tag} to ${character.characterName}`);
  }
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
    const results = await pluginAPI.apiService.searchCharacter(focusedValue, ps2Config?.honuBaseUrl);

    const choices = results.slice(0, 25).map((char) => ({
      name: `${char.name} (BR${char.battleRank}${char.prestige ? ` ASP${char.prestige}` : ""})`,
      value: char.name,
    }));

    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}
