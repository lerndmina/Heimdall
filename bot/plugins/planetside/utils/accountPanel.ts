/**
 * Unified PlanetSide 2 Account Panel (used by /ps2-link command)
 *
 * Shows an interactive panel for managing PS2 account linking.
 * Mirrors the minecraft accountPanel pattern.
 */

import { ActionRowBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import { PlanetSideApiService } from "../services/PlanetSideApiService.js";
import { getFactionEmoji, getFactionName, getServerName, formatBattleRank } from "./census-helpers.js";
import { nanoid } from "nanoid";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

const log = createLogger("planetside:panel-cmd");

/**
 * Show the unified PS2 account management panel.
 * The interaction MUST be deferred (ephemeral) before calling this.
 */
export async function showAccountPanel(interaction: ChatInputCommandInteraction, lib: LibAPI, apiService: PlanetSideApiService): Promise<void> {
  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const config = await PlanetSideConfig.findOne({ guildId }).lean();
  if (!config?.enabled) {
    const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("PlanetSide 2 account linking is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const content = await buildPanel(guildId, discordId, lib, apiService, config, interaction);
  await interaction.editReply(content);
}

// ═══════════════════════════════════════════════════════════════
// PANEL BUILDER
// ═══════════════════════════════════════════════════════════════

async function buildPanel(
  guildId: string,
  discordId: string,
  lib: LibAPI,
  apiService: PlanetSideApiService,
  config: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<{ embeds: any[]; components: ActionRowBuilder<any>[] }> {
  const [linkedPlayer, pendingPlayer] = await Promise.all([
    PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean(),
    PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: null, verificationStartedAt: { $ne: null } }).lean(),
  ]);

  const allowSelfUnlink = config.allowSelfUnlink !== false;

  // ── Build Embed ──────────────────────────────────────────────

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🎮 PlanetSide 2 Account Manager")
    .setColor(linkedPlayer ? 0x00ff00 : pendingPlayer ? 0xffa500 : 0x5865f2);

  if (linkedPlayer) {
    const isRevoked = !!linkedPlayer.revokedAt;
    const statusEmoji = isRevoked ? "🔴" : "🟢";
    const statusText = isRevoked ? "Revoked" : "Linked";

    embed.addFields({
      name: `${statusEmoji} ${linkedPlayer.characterName}`,
      value:
        `**Status:** ${statusText}\n` +
        `**Faction:** ${getFactionEmoji(linkedPlayer.factionId ?? 0)} ${getFactionName(linkedPlayer.factionId ?? 0)}\n` +
        `**Battle Rank:** ${formatBattleRank(linkedPlayer.battleRank || 0, linkedPlayer.prestige || 0)}\n` +
        `**Server:** ${getServerName(linkedPlayer.serverId || 0)}\n` +
        `**Linked:** <t:${Math.floor(new Date(linkedPlayer.linkedAt!).getTime() / 1000)}:R>` +
        (linkedPlayer.outfitTag ? `\n**Outfit:** [${linkedPlayer.outfitTag}] ${linkedPlayer.outfitName || ""}` : ""),
      inline: false,
    });
  }

  if (pendingPlayer) {
    embed.addFields({
      name: "🔄 Pending Verification",
      value:
        `**Character:** ${pendingPlayer.characterName}\n` +
        `**Started:** <t:${Math.floor(new Date(pendingPlayer.verificationStartedAt!).getTime() / 1000)}:R>\n` +
        (config.verificationMethod === "online_now"
          ? "Log in to PlanetSide 2 on that character, then click **Verify** below."
          : `Log in to PlanetSide 2 within ${config.verificationWindowMinutes || 60} minutes, then click **Verify** below.`),
      inline: false,
    });
  }

  if (!linkedPlayer && !pendingPlayer) {
    embed.setDescription("You don't have a PlanetSide 2 account linked.\n\n" + "Click **Link Account** below to get started!");
  }

  // Footer
  const displayTag = config.outfitTag ? `[${config.outfitTag}] ` : "";
  embed.setFooter({ text: `${displayTag}${config.outfitName || "PlanetSide 2"}` });

  // ── Build Buttons ────────────────────────────────────────────

  const components: ActionRowBuilder<any>[] = [];
  const mainRow = new ActionRowBuilder<any>();

  // Link Account button (only if not linked and no pending)
  if (!linkedPlayer && !pendingPlayer) {
    const linkBtn = lib.createButtonBuilder(async (btnI) => {
      await handleLinkAction(btnI, guildId, discordId, lib, apiService, config, commandInteraction);
    }, 600);
    linkBtn.setLabel("Link Account").setEmoji("🔗").setStyle(ButtonStyle.Primary);
    await linkBtn.ready();
    mainRow.addComponents(linkBtn);
  }

  // Verify button (pending verification)
  if (pendingPlayer) {
    const verifyBtn = lib.createButtonBuilder(async (btnI) => {
      await handleVerifyAction(btnI, pendingPlayer, guildId, discordId, lib, apiService, config, commandInteraction);
    }, 600);
    verifyBtn.setLabel("Verify").setEmoji("✅").setStyle(ButtonStyle.Success);
    await verifyBtn.ready();
    mainRow.addComponents(verifyBtn);

    const cancelBtn = lib.createButtonBuilder(async (btnI) => {
      await btnI.deferUpdate();
      await PlanetSidePlayer.findByIdAndDelete(pendingPlayer._id).catch(() => {});
      try {
        const refreshed = await buildPanel(guildId, discordId, lib, apiService, config, commandInteraction);
        await commandInteraction.editReply(refreshed);
      } catch (err) {
        log.error("Failed to refresh panel after cancel:", err);
      }
    }, 600);
    cancelBtn.setLabel("Cancel Request").setEmoji("✖️").setStyle(ButtonStyle.Danger);
    await cancelBtn.ready();
    mainRow.addComponents(cancelBtn);
  }

  // Refresh button
  const refreshBtn = lib.createButtonBuilder(async (btnI) => {
    await btnI.deferUpdate();
    try {
      const refreshed = await buildPanel(guildId, discordId, lib, apiService, config, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch (err) {
      log.error("Failed to refresh panel:", err);
    }
  }, 600);
  refreshBtn.setLabel("Refresh").setEmoji("🔄").setStyle(ButtonStyle.Secondary);
  await refreshBtn.ready();
  mainRow.addComponents(refreshBtn);

  components.push(mainRow);

  // Unlink button
  if (allowSelfUnlink && linkedPlayer) {
    const unlinkRow = new ActionRowBuilder<any>();
    const player = linkedPlayer;
    const unlinkBtn = lib.createButtonBuilder(async (btnI) => {
      await handleUnlinkAction(btnI, player, guildId, discordId, lib, config, commandInteraction, apiService);
    }, 600);
    unlinkBtn.setLabel(`Unlink ${player.characterName}`).setEmoji("❌").setStyle(ButtonStyle.Danger);
    await unlinkBtn.ready();
    unlinkRow.addComponents(unlinkBtn);
    components.push(unlinkRow);
  }

  return { embeds: [embed], components };
}

// ═══════════════════════════════════════════════════════════════
// LINK ACTION
// ═══════════════════════════════════════════════════════════════

async function handleLinkAction(
  btnInteraction: ButtonInteraction,
  guildId: string,
  discordId: string,
  lib: LibAPI,
  apiService: PlanetSideApiService,
  config: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<void> {
  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Link PlanetSide 2 Account");

  const nameInput = new TextInputBuilder()
    .setCustomId("characterName")
    .setLabel("Your PlanetSide 2 Character Name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("e.g. Wrel")
    .setMinLength(2)
    .setMaxLength(32);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
  await btnInteraction.showModal(modal);

  try {
    const submit = await btnInteraction.awaitModalSubmit({
      filter: (i) => i.user.id === discordId && i.customId === modalId,
      time: 300_000,
    });

    await submit.deferUpdate();

    const characterName = submit.fields.getTextInputValue("characterName").trim();

    const character = await apiService.findCharacterByName(characterName, {
      honuBaseUrl: config.honuBaseUrl,
      censusServiceId: config.censusServiceId,
    });

    if (!character) {
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Character Not Found").setDescription(`Could not find **${characterName}** in PlanetSide 2.`);
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Character Taken").setDescription(`**${character.characterName}** is already linked to another Discord account.`);
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Create pending record
    const member = await btnInteraction.guild?.members.fetch(discordId).catch(() => null);

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
          discordUsername: btnInteraction.user.username,
          discordDisplayName: member?.displayName || btnInteraction.user.globalName || btnInteraction.user.username,
          verificationStartedAt: new Date(),
          verificationMethod: config.verificationMethod || "online_now",
          source: "linked",
        },
      },
      { upsert: true, new: true },
    );

    broadcastDashboardChange(guildId, "planetside", "link_requested", { requiredAction: "planetside.view_players" });

    try {
      const refreshed = await buildPanel(guildId, discordId, lib, apiService, config, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch {
      // Panel refresh failed
    }
  } catch {
    // Modal timed out
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFY ACTION
// ═══════════════════════════════════════════════════════════════

async function handleVerifyAction(
  btnInteraction: ButtonInteraction,
  pendingPlayer: any,
  guildId: string,
  discordId: string,
  lib: LibAPI,
  apiService: PlanetSideApiService,
  config: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<void> {
  await btnInteraction.deferUpdate();

  const player = await PlanetSidePlayer.findById(pendingPlayer._id);
  if (!player) {
    return;
  }

  const verifyResult = await apiService.verifyCharacter(player.characterId, (config.verificationMethod as "online_now" | "recent_login") || "online_now", config.verificationWindowMinutes || 60, {
    honuBaseUrl: config.honuBaseUrl,
    censusServiceId: config.censusServiceId,
  });

  if (verifyResult.verified) {
    player.linkedAt = new Date();
    player.verifiedAt = new Date();
    player.verificationResult = JSON.stringify(verifyResult);
    await player.save();

    broadcastDashboardChange(guildId, "planetside", "player_linked", { requiredAction: "planetside.view_players" });

    // Assign roles
    try {
      const guild = await lib.thingGetter.getGuild(guildId);
      if (guild) {
        const member = await lib.thingGetter.getMember(guild, discordId);
        if (member) {
          if (config.roles?.member && config.outfitId && player.outfitId === config.outfitId) {
            if (!member.roles.cache.has(config.roles.member)) {
              await member.roles.add(config.roles.member).catch(() => {});
            }
          }
          if (config.roles?.guest && (!config.outfitId || player.outfitId !== config.outfitId)) {
            if (!member.roles.cache.has(config.roles.guest)) {
              await member.roles.add(config.roles.guest).catch(() => {});
            }
          }
        }
      }
    } catch {
      // Role assignment failed
    }
  }

  try {
    const refreshed = await buildPanel(guildId, discordId, lib, apiService, config, commandInteraction);
    await commandInteraction.editReply(refreshed);
  } catch {
    // Panel refresh failed
  }

  if (!verifyResult.verified) {
    const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Verification Failed").setDescription(verifyResult.detail);
    await btnInteraction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// UNLINK ACTION
// ═══════════════════════════════════════════════════════════════

async function handleUnlinkAction(
  btnInteraction: ButtonInteraction,
  player: any,
  guildId: string,
  discordId: string,
  lib: LibAPI,
  config: any,
  commandInteraction: ChatInputCommandInteraction,
  apiService: PlanetSideApiService,
): Promise<void> {
  const confirmEmbed = lib
    .createEmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ Unlink Account")
    .setDescription(`Are you sure you want to unlink **${player.characterName}**?\n\nThis will remove your linked roles.`);

  const confirmBtn = lib.createButtonBuilder(async (ci) => {
    await PlanetSidePlayer.findByIdAndDelete(player._id);
    broadcastDashboardChange(guildId, "planetside", "player_unlinked", { requiredAction: "planetside.view_players" });

    const doneEmbed = lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Account Unlinked").setDescription(`**${player.characterName}** has been unlinked.`);
    await ci.update({ embeds: [doneEmbed], components: [] });

    try {
      const refreshed = await buildPanel(guildId, discordId, lib, apiService, config, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch {
      // Panel refresh failed
    }
  }, 120);
  confirmBtn.setLabel("Yes, Unlink").setStyle(ButtonStyle.Danger);
  await confirmBtn.ready();

  const cancelBtn = lib.createButtonBuilder(async (ci) => {
    await ci.update({ content: "Cancelled.", embeds: [], components: [] });
  }, 120);
  cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
  await cancelBtn.ready();

  const confirmRow = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
  await btnInteraction.reply({
    embeds: [confirmEmbed],
    components: [confirmRow],
    flags: MessageFlags.Ephemeral,
  });
}
