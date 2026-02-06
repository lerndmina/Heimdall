/**
 * /link-minecraft <username> — Start the account linking flow
 *
 * Creates a pending auth record. User must then join the MC server
 * to receive their auth code, then confirm with /confirm-code.
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:link");

export const data = new SlashCommandBuilder()
  .setName("link-minecraft")
  .setDescription("Link your Discord account to your Minecraft account")
  .addStringOption((opt) => opt.setName("username").setDescription("Your Minecraft username").setRequired(true));

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
  const minecraftUsername = interaction.options.getString("username", true).toLowerCase();

  // Check config
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

      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0xffff00)
        .setTitle("✏️ Username Updated")
        .setDescription(
          `Your pending link request has been updated to **${minecraftUsername}**.\n\n` +
            `**Next Steps:**\n` +
            `1. Try joining the Minecraft server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
            `2. You'll be kicked with your authentication code\n` +
            `3. Use that code with \`/confirm-code <code>\`\n\n` +
            `**Request expires:** <t:${Math.floor((existingPending.expiresAt?.getTime() || Date.now()) / 1000)}:R>`,
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xffff00)
      .setTitle("⏳ Pending Request")
      .setDescription(
        `You already have a pending link request for **${existingPending.minecraftUsername}**.\n\n` +
          `**To complete linking:**\n` +
          `1. Try joining the Minecraft server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
          `2. You'll be kicked with your authentication code\n` +
          `3. Use that code with \`/confirm-code <code>\`\n\n` +
          `**Request expires:** <t:${Math.floor((existingPending.expiresAt?.getTime() || Date.now()) / 1000)}:R>\n\n` +
          `*Want to change the username? Just run this command again with a different username.*`,
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Check if already linked to a different MC account
  const existingPlayer = await MinecraftPlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();
  if (existingPlayer) {
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Already Linked")
      .setDescription(`Your Discord account is already linked to **${existingPlayer.minecraftUsername}**.\n\n` + `Use \`/minecraft-status\` to see your current status.`);
    await interaction.editReply({ embeds: [embed] });
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

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0xffff00)
    .setTitle("🎮 Link Request Created")
    .setDescription(
      `**Step 1 Complete!** Your authentication request has been created.\n\n` +
        `**Next Steps:**\n` +
        `1. Try joining the Minecraft server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n` +
        `2. You'll be kicked with your authentication code\n` +
        `3. Come back here and use \`/confirm-code <your-code>\`\n` +
        `4. **Wait for staff approval** - This may take some time\n\n` +
        `⏰ **Important:** Staff must manually approve your whitelist request before you can join the server.\n\n` +
        `**Your request expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
    )
    .setFooter({ text: "Your authentication code will be shown when you try to join" });

  await interaction.editReply({ embeds: [embed] });
}
