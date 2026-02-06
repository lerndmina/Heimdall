/**
 * /minecraft-status — Check your Minecraft account linking status
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";

export const data = new SlashCommandBuilder().setName("minecraft-status").setDescription("Check your Minecraft account linking status");

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

  const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
  if (!mcConfig?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("Minecraft account linking is not enabled.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Check for linked player
  const player = await MinecraftPlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();

  // Check for pending auth
  const pendingAuth = await MinecraftPlayer.findOne({
    guildId,
    discordId,
    authCode: { $ne: null },
    linkedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (player) {
    const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;
    const statusEmoji = isWhitelisted ? "✅" : "❌";
    const statusText = isWhitelisted ? "Whitelisted" : "Not Whitelisted";

    let desc =
      `**Minecraft Username:** ${player.minecraftUsername}\n` + `**Status:** ${statusEmoji} ${statusText}\n` + `**Linked:** <t:${Math.floor(new Date(player.linkedAt!).getTime() / 1000)}:R>\n`;

    if (isWhitelisted) {
      desc += `\n**Server:** \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n✅ You can join the server!`;
    } else if (player.revokedAt) {
      desc += `\n❌ Your whitelist was revoked.`;
    } else {
      desc += `\n⏳ Pending staff approval.`;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(isWhitelisted ? 0x00ff00 : 0xffa500)
      .setTitle("🎮 Your Minecraft Status")
      .setDescription(desc);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (pendingAuth) {
    const code = pendingAuth.authCode;
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xffff00)
      .setTitle("🔄 Authentication In Progress")
      .setDescription(
        `**Minecraft Username:** ${pendingAuth.minecraftUsername}\n` +
          `**Status:** ⏳ Pending Confirmation\n` +
          `**Expires:** <t:${Math.floor((pendingAuth.expiresAt?.getTime() || 0) / 1000)}:R>\n\n` +
          `**Next Steps:**\n` +
          (pendingAuth.codeShownAt
            ? `**Your Code:** \`${code}\`\nUse \`/confirm-code ${code}\``
            : `1. Join the server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n2. Get code\n3. Use \`/confirm-code <code>\``),
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Not linked
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x0000ff)
    .setTitle("❓ No Minecraft Account Linked")
    .setDescription("You don't have a Minecraft account linked.\n\nUse `/link-minecraft <username>` to start.");
  await interaction.editReply({ embeds: [embed] });
}
