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
    const conflict = await MinecraftPlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();
    if (conflict) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Already Linked").setDescription(`Your Discord account is already linked to **${conflict.minecraftUsername}**.`);
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

  // Normal link (requires approval)
  pendingAuth.linkedAt = new Date();
  await pendingAuth.save();

  const approvalMessage = mcConfig.autoWhitelist
    ? "Your account will be automatically approved shortly."
    : "Your request is now **pending staff approval**. Staff will review your request manually and approve it when they're available.";

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0xffff00)
    .setTitle("✅ Code Confirmed")
    .setDescription(
      `**Authentication Successful!**\n\n` +
        `Your Discord account is now linked to **${pendingAuth.minecraftUsername}**.\n\n` +
        `⏳ ${approvalMessage}\n\n` +
        `**What happens next:**\n` +
        `• Staff will review your request in the queue\n` +
        `• You'll get a DM notification when approved\n` +
        `• Then you can join the Minecraft server!\n\n` +
        `Use \`/minecraft-status\` to check your current status.`,
    )
    .setFooter({ text: "Please wait patiently for staff approval" });

  await interaction.editReply({ embeds: [embed] });
}
