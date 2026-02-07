/**
 * /confirm-code <code> — Confirm a 6-digit Minecraft auth code
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:confirm");

export const data = new SlashCommandBuilder()
  .setName("confirm-code")
  .setDescription("Confirm your Minecraft authentication code")
  .addStringOption((opt) => opt.setName("code").setDescription("The 6-digit code you received when trying to join the server").setRequired(true).setMinLength(6).setMaxLength(6));

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;
  const code = interaction.options.getString("code", true);

  if (!/^\d{6}$/.test(code)) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Invalid Code").setDescription("Authentication codes must be exactly 6 digits.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
  if (!mcConfig?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("Minecraft account linking is not enabled on this server.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Find pending auth
  const pendingAuth = await MinecraftPlayer.findOne({
    guildId,
    authCode: code,
    linkedAt: null,
    expiresAt: { $gt: new Date() },
    $or: [{ discordId }, { discordId: null, isExistingPlayerLink: true }],
  });

  if (!pendingAuth) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Invalid Code")
      .setDescription(
        "No pending authentication found with that code.\n\n" +
          "Make sure you:\n" +
          "• Used the correct 6-digit code\n" +
          "• Got the code by trying to join the Minecraft server\n" +
          "• Haven't already confirmed this code\n\n" +
          "Need to start over? Use `/link-minecraft <username>`",
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (!pendingAuth.codeShownAt) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Invalid Process")
      .setDescription(
        "You must try joining the Minecraft server first to receive your code.\n\n" +
          `**Steps:**\n` +
          `1. Join: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
          `2. Get kicked with your code\n` +
          `3. Come back and use \`/confirm-code <code>\``,
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Handle existing-player link (immediate whitelist)
  if (pendingAuth.isExistingPlayerLink && pendingAuth.whitelistedAt) {
    // Check max accounts limit
    const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;
    const linkedCount = await MinecraftPlayer.countDocuments({ guildId, discordId, linkedAt: { $ne: null } });
    if (linkedCount >= maxAccounts) {
      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Account Limit Reached")
        .setDescription(`You've reached the maximum of **${maxAccounts}** linked account${maxAccounts > 1 ? "s" : ""}.\n\n` + `Use \`/minecraft-status\` to manage your accounts.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    pendingAuth.discordId = discordId;
    pendingAuth.discordUsername = interaction.user.username;
    pendingAuth.discordDisplayName = (interaction.member as any)?.displayName || interaction.user.globalName;
    pendingAuth.linkedAt = new Date();
    pendingAuth.authCode = undefined;
    pendingAuth.expiresAt = undefined;
    pendingAuth.codeShownAt = undefined;
    pendingAuth.confirmedAt = undefined;
    pendingAuth.isExistingPlayerLink = undefined;
    await pendingAuth.save();

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Account Linked Successfully")
      .setDescription(
        `Your Minecraft account **${pendingAuth.minecraftUsername}** has been linked!\n\n` +
          `✅ You're already whitelisted and can join the server immediately.\n\n` +
          `**Server:** \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n\n` +
          `Use \`/minecraft-status\` to view your account details.`,
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Normal link
  pendingAuth.linkedAt = new Date();

  // Auto-whitelist if configured
  if (mcConfig.autoWhitelist) {
    pendingAuth.whitelistedAt = new Date();
    pendingAuth.approvedBy = "auto";
  }

  await pendingAuth.save();

  if (mcConfig.autoWhitelist) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Account Linked & Whitelisted!")
      .setDescription(
        `Your Discord account is now linked to **${pendingAuth.minecraftUsername}**.\n\n` +
          `✅ You've been automatically whitelisted and can join the server now!\n\n` +
          `**Server:** \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n\n` +
          `Use \`/minecraft-status\` to view your account details.`,
      );
    await interaction.editReply({ embeds: [embed] });
  } else {
    const approvalMessage = mcConfig.requireApproval
      ? "Your request is now **pending staff approval**. Staff will review and approve it when available."
      : "Your account has been linked. Staff will process your whitelist request.";

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xffff00)
      .setTitle("✅ Code Confirmed")
      .setDescription(
        `**Authentication Successful!**\n\n` +
          `Your Discord account is now linked to **${pendingAuth.minecraftUsername}**.\n\n` +
          `⏳ ${approvalMessage}\n\n` +
          `Use \`/minecraft-status\` to check your current status.`,
      )
      .setFooter({ text: "You'll receive a notification when your request is processed" });
    await interaction.editReply({ embeds: [embed] });
  }
}
