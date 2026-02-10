/**
 * /link-minecraft [username] — Minecraft account management panel
 *
 * When run without a username: shows the interactive account manager panel
 * (same as /minecraft-status) with buttons for link, unlink, refresh.
 *
 * When run with a username: starts the link flow directly and then
 * shows the panel for ongoing management.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { showAccountPanel } from "../utils/accountPanel.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

const log = createLogger("minecraft:link");

export const data = new SlashCommandBuilder()
  .setName("link-minecraft")
  .setDescription("Manage your Minecraft account linking")
  .addStringOption((opt) => opt.setName("username").setDescription("Your Minecraft username (or leave blank to open the panel)").setRequired(false));

export const config = { allowInDMs: false };

export const permissions = {
  label: "Link Minecraft",
  description: "Manage your Minecraft account linking",
  defaultAllow: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const minecraftUsername = interaction.options.getString("username")?.trim().toLowerCase();

  // No username provided — show the interactive panel
  if (!minecraftUsername) {
    await showAccountPanel(interaction, pluginAPI.lib);
    return;
  }

  // ── Username provided — direct link flow ───────────────────────

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
  if (!mcConfig?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("Minecraft account linking is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Validate username
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Invalid Username")
      .setDescription("Minecraft usernames must be 3-16 characters and contain only letters, numbers, and underscores.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Cleanup expired pending auths
  await MinecraftPlayer.deleteMany({
    guildId,
    discordId,
    authCode: { $ne: null },
    linkedAt: null,
    expiresAt: { $lte: new Date() },
  }).catch(() => {});

  // Check for existing pending
  const existingPending = await MinecraftPlayer.findOne({
    guildId,
    discordId,
    authCode: { $ne: null },
    linkedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (existingPending) {
    if (existingPending.minecraftUsername.toLowerCase() !== minecraftUsername) {
      existingPending.minecraftUsername = minecraftUsername;
      existingPending.codeShownAt = undefined;
      await existingPending.save();
    }
    // Show the panel — it will display the pending request
    await showAccountPanel(interaction, pluginAPI.lib);
    return;
  }

  // Check if already linked — enforce maxPlayersPerUser
  const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;
  const linkedAccounts = await MinecraftPlayer.find({ guildId, discordId, linkedAt: { $ne: null } }).lean();

  if (linkedAccounts.length >= maxAccounts) {
    // Show the panel — it will display linked accounts and the limit
    await showAccountPanel(interaction, pluginAPI.lib);
    return;
  }

  // Check if this specific MC username is already linked to this user
  const alreadyLinkedSameUsername = linkedAccounts.find((p) => p.minecraftUsername.toLowerCase() === minecraftUsername);
  if (alreadyLinkedSameUsername) {
    await showAccountPanel(interaction, pluginAPI.lib);
    return;
  }

  // Check if MC username taken by another Discord user
  const existingMcPlayer = await MinecraftPlayer.findOne({ guildId, minecraftUsername, discordId: { $ne: null } }).lean();
  if (existingMcPlayer) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Username Taken")
      .setDescription(`The Minecraft username **${minecraftUsername}** is already linked to another Discord account.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Generate unique auth code
  let authCode = "";
  for (let i = 0; i < 10; i++) {
    authCode = Math.floor(100000 + Math.random() * 900000).toString();
    const exists = await MinecraftPlayer.exists({ authCode });
    if (!exists) break;
  }

  const expiresAt = new Date(Date.now() + (mcConfig.authCodeExpiry || 300) * 1000);
  const member = await interaction.guild?.members.fetch(discordId).catch(() => null);

  try {
    await MinecraftPlayer.create({
      guildId,
      discordId,
      minecraftUsername,
      authCode,
      expiresAt,
      discordUsername: interaction.user.username,
      discordDisplayName: member?.displayName || interaction.user.globalName || interaction.user.username,
      source: "linked",
    });
  } catch (error) {
    log.error("Failed to create pending auth:", error);
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Error").setDescription("Failed to create authentication request. Please try again later.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  broadcastDashboardChange(guildId, "minecraft", "link_requested", { requiredAction: "minecraft.view_players" });

  // Show the panel — it will now show the new pending request with all management buttons
  await showAccountPanel(interaction, pluginAPI.lib);
}
