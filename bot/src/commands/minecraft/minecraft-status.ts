import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder } from "discord.js";
import Database from "../../utils/data/database";
import MinecraftConfig from "../../models/MinecraftConfig";
import MinecraftPlayer from "../../models/MinecraftPlayer";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("minecraft-status")
  .setDescription("Check your Minecraft account linking status")
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: !env.ENABLE_MINECRAFT_SYSTEMS,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const db = new Database();

  // Check if minecraft integration is enabled for this guild
  const { data: config, error: configError } = await tryCatch(
    db.findOne(MinecraftConfig, { guildId })
  );

  if (configError) {
    log.error("Failed to fetch minecraft config:", configError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check configuration. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  if (!config || !config.enabled) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Not Available",
          "Minecraft account linking is not enabled on this server."
        ).setColor("Red"),
      ],
    });
  }

  // Check for existing player record
  const { data: existingPlayer, error: playerError } = await tryCatch(
    db.findOne(MinecraftPlayer, { guildId, discordId })
  );

  if (playerError) {
    log.error("Failed to check existing player:", playerError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check your status. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  // Check for pending authentication
  const { data: pendingAuth, error: authError } = await tryCatch(
    MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: { $ne: null }, // Has an auth code
      linkedAt: null, // But not yet linked
      expiresAt: { $gt: new Date() }, // Only get non-expired records
    }).lean()
  );

  if (authError) {
    log.error("Failed to check pending auth:", authError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check pending authentication. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  // If user has a linked account
  if (existingPlayer) {
    const isWhitelisted = existingPlayer.isWhitelisted;
    const statusEmoji = isWhitelisted ? "✅" : "❌";
    const statusText = isWhitelisted ? "Whitelisted" : "Not Whitelisted";

    const description =
      `**Minecraft Username:** ${existingPlayer.minecraftUsername}\n` +
      `**Status:** ${statusEmoji} ${statusText}\n` +
      `**Linked:** <t:${Math.floor(
        (existingPlayer.linkedAt || existingPlayer.createdAt).getTime() / 1000
      )}:R>\n`;

    let additionalInfo = "";
    if (isWhitelisted) {
      additionalInfo = `\n**Server:** \`${config.serverHost}:${config.serverPort}\`\n✅ You can join the server!`;
    } else {
      additionalInfo = "\n❌ You are not currently whitelisted.";
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "🎮 Your Minecraft Status", description + additionalInfo).setColor(
          isWhitelisted ? "Green" : "Orange"
        ),
      ],
    });
  }

  // If user has pending authentication
  if (pendingAuth) {
    const authStatus = pendingAuth.authStatus;
    const statusEmoji =
      {
        pending: "⏳",
        shown: "📋",
        confirmed: "✅",
        expired: "❌",
      }[authStatus] || "❓";

    const statusText =
      {
        pending: "Waiting for you to join the server",
        shown: "Code shown - waiting for confirmation",
        confirmed: "Code confirmed - waiting for staff approval",
        expired: "Authentication expired",
      }[authStatus] || "Unknown";

    const description =
      `**Minecraft Username:** ${pendingAuth.minecraftUsername}\n` +
      `**Status:** ${statusEmoji} ${statusText}\n` +
      `**Created:** <t:${Math.floor(pendingAuth.createdAt.getTime() / 1000)}:R>\n` +
      `**Expires:** <t:${Math.floor((pendingAuth.expiresAt || new Date()).getTime() / 1000)}:R>\n`;

    let nextSteps = "";
    if (authStatus === "pending") {
      nextSteps = `\n**Next Steps:**\n1. Join the server: \`${config.serverHost}:${config.serverPort}\`\n2. You'll get your auth code\n3. Use \`/confirm-code <code>\``;
    } else if (authStatus === "shown") {
      nextSteps = `\n**Your Code:** \`${pendingAuth.authCode}\`\n**Next Step:** Use \`/confirm-code ${pendingAuth.authCode}\``;
    } else if (authStatus === "confirmed") {
      nextSteps = "\n⏳ Waiting for staff to approve your request.";
    } else if (authStatus === "expired") {
      nextSteps = "\n❌ This authentication has expired. Use `/link-minecraft` to start over.";
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "🔄 Authentication In Progress", description + nextSteps).setColor(
          "Yellow"
        ),
      ],
    });
  }

  // No pending auth or linked account
  return interaction.editReply({
    embeds: [
      BasicEmbed(
        client,
        "❓ No Minecraft Account Linked",
        "You don't have a Minecraft account linked to your Discord account.\n\n" +
          "**To get started:**\n" +
          "Use `/link-minecraft <your-username>` to begin the linking process."
      ).setColor("Blue"),
    ],
  });
}
