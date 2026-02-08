/**
 * Unified Minecraft Account Manager Panel
 *
 * Used by both /link-minecraft and /minecraft-status to show
 * a smart interactive panel for managing Minecraft account linking.
 * Replaces the old separate status / link command flows with a single
 * button-based panel similar to the modmail config system.
 */

import { ActionRowBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { nanoid } from "nanoid";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:panel-cmd");

/**
 * Show the unified Minecraft account management panel.
 * The interaction MUST be deferred (ephemeral) before calling this.
 */
export async function showAccountPanel(interaction: ChatInputCommandInteraction, lib: LibAPI): Promise<void> {
  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
  if (!mcConfig?.enabled) {
    const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("Minecraft account linking is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const content = await buildPanel(guildId, discordId, lib, mcConfig, interaction);
  await interaction.editReply(content);
}

// ═══════════════════════════════════════════════════════════════
// PANEL BUILDER
// ═══════════════════════════════════════════════════════════════

async function buildPanel(
  guildId: string,
  discordId: string,
  lib: LibAPI,
  mcConfig: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<{ embeds: any[]; components: ActionRowBuilder<any>[] }> {
  // Clean up expired pending auths
  await MinecraftPlayer.deleteMany({
    guildId,
    discordId,
    authCode: { $ne: null },
    linkedAt: null,
    expiresAt: { $lte: new Date() },
  }).catch(() => {});

  // Fetch linked players and pending auth in parallel
  const [linkedPlayers, pendingAuth] = await Promise.all([
    MinecraftPlayer.find({ guildId, discordId, linkedAt: { $ne: null } })
      .sort({ linkedAt: 1 })
      .lean(),
    MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: { $ne: null },
      linkedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean(),
  ]);

  const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;
  const slotsRemaining = maxAccounts - linkedPlayers.length;
  const allowSelfUnlink = mcConfig.allowSelfUnlink !== false;
  const allWhitelisted = linkedPlayers.length > 0 && linkedPlayers.every((p) => !!p.whitelistedAt && !p.revokedAt);

  // ── Build Embed ──────────────────────────────────────────────

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🎮 Minecraft Account Manager")
    .setColor(linkedPlayers.length > 0 ? (allWhitelisted ? 0x00ff00 : 0xffa500) : 0x5865f2);

  // Status fields for each linked account
  if (linkedPlayers.length > 0) {
    for (const player of linkedPlayers) {
      const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;
      const statusEmoji = player.revokedAt ? "🔴" : isWhitelisted ? "🟢" : "🟡";
      const statusText = player.revokedAt ? "Revoked" : isWhitelisted ? "Whitelisted" : "Pending Approval";

      embed.addFields({
        name: `${statusEmoji} ${player.minecraftUsername}`,
        value:
          `**Status:** ${statusText}\n` +
          `**Linked:** <t:${Math.floor(new Date(player.linkedAt!).getTime() / 1000)}:R>` +
          (isWhitelisted ? `\n**Whitelisted:** <t:${Math.floor(new Date(player.whitelistedAt!).getTime() / 1000)}:R>` : ""),
        inline: linkedPlayers.length <= 3,
      });
    }
  }

  // Pending auth field
  if (pendingAuth) {
    embed.addFields({
      name: "🔄 Pending Link Request",
      value:
        `**Username:** ${pendingAuth.minecraftUsername}\n` +
        `**Expires:** <t:${Math.floor((pendingAuth.expiresAt?.getTime() || 0) / 1000)}:R>\n` +
        (pendingAuth.codeShownAt ? `**Code:** \`${pendingAuth.authCode}\` — Click **Confirm Code** below` : `Join \`${mcConfig.serverHost}:${mcConfig.serverPort}\` to receive your code`),
      inline: false,
    });
  }

  // Description based on state
  if (linkedPlayers.length === 0 && !pendingAuth) {
    embed.setDescription(
      "You don't have any Minecraft accounts linked.\n\n" + "Click **Link Account** below to get started!" + (maxAccounts > 1 ? `\n💡 You can link up to **${maxAccounts}** accounts.` : ""),
    );
  } else if (slotsRemaining > 0 && !pendingAuth) {
    embed.setDescription(`Click **Link Account** to link ${linkedPlayers.length > 0 ? "another" : "your"} Minecraft account.`);
  }

  // Footer
  let footer = `Server: ${mcConfig.serverHost}:${mcConfig.serverPort}`;
  if (maxAccounts > 1) {
    footer += ` • ${linkedPlayers.length}/${maxAccounts} slots used`;
  }
  embed.setFooter({ text: footer });

  // ── Build Buttons ────────────────────────────────────────────

  const components: ActionRowBuilder<any>[] = [];
  const mainRow = new ActionRowBuilder<any>();

  // Link Account button — only if under limit and no pending auth
  if (slotsRemaining > 0 && !pendingAuth) {
    const linkBtn = lib.createButtonBuilder(async (btnI) => {
      await handleLinkAction(btnI, guildId, discordId, lib, mcConfig, commandInteraction);
    }, 600);
    linkBtn
      .setLabel(linkedPlayers.length > 0 ? "Link Another" : "Link Account")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Primary);
    await linkBtn.ready();
    mainRow.addComponents(linkBtn);
  }

  // Pending auth buttons — confirm code + cancel
  if (pendingAuth) {
    // Confirm Code button — only when code has been shown (user joined the server)
    if (pendingAuth.codeShownAt) {
      const confirmBtn = lib.createButtonBuilder(async (btnI) => {
        await handleConfirmCodeAction(btnI, pendingAuth, guildId, discordId, lib, mcConfig, commandInteraction);
      }, 600);
      confirmBtn.setLabel("Confirm Code").setEmoji("✅").setStyle(ButtonStyle.Success);
      await confirmBtn.ready();
      mainRow.addComponents(confirmBtn);
    }

    const cancelBtn = lib.createButtonBuilder(async (btnI) => {
      await btnI.deferUpdate();
      await MinecraftPlayer.findByIdAndDelete(pendingAuth._id).catch(() => {});
      try {
        const refreshed = await buildPanel(guildId, discordId, lib, mcConfig, commandInteraction);
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
      const refreshed = await buildPanel(guildId, discordId, lib, mcConfig, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch (err) {
      log.error("Failed to refresh panel:", err);
    }
  }, 600);
  refreshBtn.setLabel("Refresh").setEmoji("🔄").setStyle(ButtonStyle.Secondary);
  await refreshBtn.ready();
  mainRow.addComponents(refreshBtn);

  components.push(mainRow);

  // Unlink buttons — only if self-unlink is allowed
  if (allowSelfUnlink && linkedPlayers.length > 0) {
    const unlinkRow = new ActionRowBuilder<any>();
    for (const player of linkedPlayers.slice(0, 5)) {
      const p = player; // stable closure capture
      const unlinkBtn = lib.createButtonBuilder(async (btnI) => {
        await handleUnlinkAction(btnI, p, guildId, discordId, lib, mcConfig, commandInteraction);
      }, 600);
      unlinkBtn.setLabel(`Unlink ${p.minecraftUsername}`).setEmoji("❌").setStyle(ButtonStyle.Danger);
      await unlinkBtn.ready();
      unlinkRow.addComponents(unlinkBtn);
    }
    components.push(unlinkRow);
  }

  return { embeds: [embed], components };
}

// ═══════════════════════════════════════════════════════════════
// LINK ACTION — Modal flow
// ═══════════════════════════════════════════════════════════════

async function handleLinkAction(btnInteraction: ButtonInteraction, guildId: string, discordId: string, lib: LibAPI, mcConfig: any, commandInteraction: ChatInputCommandInteraction): Promise<void> {
  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Link Minecraft Account");

  const usernameInput = new TextInputBuilder()
    .setCustomId("username")
    .setLabel("Your Minecraft Username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("e.g. Steve")
    .setMinLength(3)
    .setMaxLength(16);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput));
  await btnInteraction.showModal(modal);

  try {
    const submit = await btnInteraction.awaitModalSubmit({
      filter: (i) => i.user.id === discordId && i.customId === modalId,
      time: 300_000, // 5 minutes
    });

    // Acknowledge the modal — don't create a separate reply
    await submit.deferUpdate();

    const minecraftUsername = submit.fields.getTextInputValue("username").trim();

    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Invalid Username").setDescription("Minecraft usernames must be 3–16 characters (letters, numbers, underscores only).");
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Check if already linked to this user
    const alreadyLinked = await MinecraftPlayer.findOne({
      guildId,
      discordId,
      minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
      linkedAt: { $ne: null },
    }).lean();

    if (alreadyLinked) {
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Already Linked").setDescription(`You're already linked to **${alreadyLinked.minecraftUsername}**.`);
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Check if taken by another user
    const taken = await MinecraftPlayer.findOne({
      guildId,
      minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
      discordId: { $ne: null, $nin: [discordId] },
      linkedAt: { $ne: null },
    }).lean();

    if (taken) {
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Username Taken").setDescription(`**${minecraftUsername}** is already linked to another Discord account.`);
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Clean up any expired pending auths (owned by this user, not unclaimed records)
    await MinecraftPlayer.deleteMany({
      guildId,
      discordId,
      authCode: { $ne: null },
      linkedAt: null,
      expiresAt: { $lte: new Date() },
    }).catch(() => {});

    // Generate unique auth code
    let authCode = "";
    for (let i = 0; i < 10; i++) {
      authCode = Math.floor(100000 + Math.random() * 900000).toString();
      const exists = await MinecraftPlayer.exists({ authCode });
      if (!exists) break;
    }

    const expiresAt = new Date(Date.now() + (mcConfig.authCodeExpiry || 300) * 1000);
    const member = await btnInteraction.guild?.members.fetch(discordId).catch(() => null);

    try {
      // Upsert — if an unclaimed record already exists (e.g. from import or previous
      // server join), update it with auth data instead of failing on duplicate key.
      await MinecraftPlayer.findOneAndUpdate(
        {
          guildId,
          minecraftUsername: { $regex: new RegExp(`^${minecraftUsername}$`, "i") },
        },
        {
          $set: {
            minecraftUsername,
            discordId,
            authCode,
            expiresAt,
            codeShownAt: undefined,
            linkedAt: undefined,
            discordUsername: btnInteraction.user.username,
            discordDisplayName: member?.displayName || btnInteraction.user.globalName || btnInteraction.user.username,
            source: "linked",
          },
        },
        { upsert: true, new: true },
      );
    } catch (error) {
      log.error("Failed to create pending auth:", error);
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Error").setDescription("Failed to create authentication request. Please try again later.");
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Refresh the panel — it will now show the pending request with next steps
    try {
      const refreshed = await buildPanel(guildId, discordId, lib, mcConfig, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch {
      // Panel refresh failed (interaction token may have expired) — that's OK
    }
  } catch {
    // Modal timed out — ignore
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM CODE ACTION — Modal flow (replaces /confirm-code command)
// ═══════════════════════════════════════════════════════════════

async function handleConfirmCodeAction(
  btnInteraction: ButtonInteraction,
  pendingAuth: any,
  guildId: string,
  discordId: string,
  lib: LibAPI,
  mcConfig: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<void> {
  const modalId = nanoid();
  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Confirm Authentication Code");

  const codeInput = new TextInputBuilder()
    .setCustomId("code")
    .setLabel("Enter your 6-digit code")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("e.g. 123456")
    .setMinLength(6)
    .setMaxLength(6);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
  await btnInteraction.showModal(modal);

  try {
    const submit = await btnInteraction.awaitModalSubmit({
      filter: (i) => i.user.id === discordId && i.customId === modalId,
      time: 300_000,
    });

    await submit.deferUpdate();

    const code = submit.fields.getTextInputValue("code").trim();

    if (!/^\d{6}$/.test(code)) {
      const embed = lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Invalid Code").setDescription("Authentication codes must be exactly 6 digits.");
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Re-fetch the pending auth to validate the code matches
    const freshAuth = await MinecraftPlayer.findOne({
      guildId,
      authCode: code,
      linkedAt: null,
      expiresAt: { $gt: new Date() },
      $or: [{ discordId }, { discordId: null, isExistingPlayerLink: true }],
    });

    if (!freshAuth) {
      const embed = lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Invalid Code")
        .setDescription(
          "No pending authentication found with that code.\n\n" +
            "Make sure you:\n" +
            "• Used the correct 6-digit code\n" +
            "• Got the code by trying to join the Minecraft server\n" +
            "• Haven't already confirmed this code",
        );
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!freshAuth.codeShownAt) {
      const embed = lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Invalid Process")
        .setDescription(`You must try joining the Minecraft server first to receive your code.\n\n` + `**Join:** \`${mcConfig.serverHost}:${mcConfig.serverPort}\``);
      await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Handle existing-player link (immediate whitelist)
    if (freshAuth.isExistingPlayerLink && freshAuth.whitelistedAt) {
      const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;
      const linkedCount = await MinecraftPlayer.countDocuments({ guildId, discordId, linkedAt: { $ne: null } });
      if (linkedCount >= maxAccounts) {
        const embed = lib
          .createEmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Account Limit Reached")
          .setDescription(`You've reached the maximum of **${maxAccounts}** linked account${maxAccounts > 1 ? "s" : ""}.`);
        await submit.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      freshAuth.discordId = discordId;
      freshAuth.discordUsername = btnInteraction.user.username;
      freshAuth.discordDisplayName = (btnInteraction.member as any)?.displayName || btnInteraction.user.globalName;
      freshAuth.linkedAt = new Date();
      freshAuth.authCode = undefined;
      freshAuth.expiresAt = undefined;
      freshAuth.codeShownAt = undefined;
      freshAuth.confirmedAt = undefined;
      freshAuth.isExistingPlayerLink = undefined;
      await freshAuth.save();
    } else {
      // Normal link
      freshAuth.linkedAt = new Date();

      if (mcConfig.autoWhitelist) {
        freshAuth.whitelistedAt = new Date();
        freshAuth.approvedBy = "auto";
      }

      await freshAuth.save();
    }

    // Refresh the panel — it will now show the newly linked account
    try {
      const refreshed = await buildPanel(guildId, discordId, lib, mcConfig, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch {
      // Panel refresh failed — that's OK
    }
  } catch {
    // Modal timed out — ignore
  }
}

// ═══════════════════════════════════════════════════════════════
// UNLINK ACTION — Confirmation flow
// ═══════════════════════════════════════════════════════════════

async function handleUnlinkAction(
  btnInteraction: ButtonInteraction,
  player: any,
  guildId: string,
  discordId: string,
  lib: LibAPI,
  mcConfig: any,
  commandInteraction: ChatInputCommandInteraction,
): Promise<void> {
  // Show confirmation as a separate ephemeral reply
  const confirmEmbed = lib
    .createEmbedBuilder()
    .setColor(0xff0000)
    .setTitle("⚠️ Unlink Account")
    .setDescription(`Are you sure you want to unlink **${player.minecraftUsername}**?\n\n` + `This will remove your whitelist and you won't be able to join until you re-link.`);

  const confirmBtn = lib.createButtonBuilder(async (ci) => {
    await MinecraftPlayer.findByIdAndDelete(player._id);

    const doneEmbed = lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Account Unlinked").setDescription(`**${player.minecraftUsername}** has been unlinked from your Discord account.`);
    await ci.update({ embeds: [doneEmbed], components: [] });

    // Refresh the main panel
    try {
      const refreshed = await buildPanel(guildId, discordId, lib, mcConfig, commandInteraction);
      await commandInteraction.editReply(refreshed);
    } catch {
      // Panel refresh failed — that's OK
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
