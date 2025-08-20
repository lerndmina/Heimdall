import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder } from "discord.js";
import Database from "../../utils/data/database";
import MinecraftConfig from "../../models/MinecraftConfig";
import MinecraftAuthPending from "../../models/MinecraftAuthPending";
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

  // Check for pending authentication (only non-expired ones)
  const { data: pendingAuth, error: authError } = await tryCatch(
    MinecraftAuthPending.findOne({
      guildId,
      discordId,
      status: { $ne: "expired" },
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
    const statusEmoji =
      {
        whitelisted: "✅",
        unwhitelisted: "❌",
      }[existingPlayer.whitelistStatus] || "❓";

    const statusText =
      {
        whitelisted: "Whitelisted",
        unwhitelisted: "Not Whitelisted",
      }[existingPlayer.whitelistStatus] || "Unknown";

    const description =
      `**Minecraft Username:** ${existingPlayer.minecraftUsername}\n` +
      `**Status:** ${statusEmoji} ${statusText}\n` +
      `**Linked:** <t:${Math.floor(
        (existingPlayer.linkedAt || existingPlayer.createdAt).getTime() / 1000
      )}:R>\n`;

    let additionalInfo = "";
    if (existingPlayer.whitelistStatus === "whitelisted") {
      additionalInfo = `\n**Server:** \`${config.serverHost}:${config.serverPort}\`\n✅ You can join the server!`;
    } else {
      additionalInfo = "\n❌ You are not currently whitelisted.";
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "🎮 Your Minecraft Status", description + additionalInfo).setColor(
          existingPlayer.whitelistStatus === "whitelisted" ? "Green" : "Orange"
        ),
      ],
    });
  }

  // If user has pending authentication
  if (pendingAuth) {
    const statusEmoji =
      {
        awaiting_connection: "⏳",
        code_shown: "📋",
        code_confirmed: "✅",
      }[pendingAuth.status] || "❓";

    const statusText =
      {
        awaiting_connection: "Waiting for you to join the server",
        code_shown: "Code shown - waiting for confirmation",
        code_confirmed: "Code confirmed - waiting for staff approval",
      }[pendingAuth.status] || "Unknown";

    const description =
      `**Minecraft Username:** ${pendingAuth.minecraftUsername}\n` +
      `**Status:** ${statusEmoji} ${statusText}\n` +
      `**Created:** <t:${Math.floor(pendingAuth.createdAt.getTime() / 1000)}:R>\n` +
      `**Expires:** <t:${Math.floor(pendingAuth.expiresAt.getTime() / 1000)}:R>\n`;

    let nextSteps = "";
    if (pendingAuth.status === "awaiting_connection") {
      nextSteps = `\n**Next Steps:**\n1. Join the server: \`${config.serverHost}:${config.serverPort}\`\n2. You'll get your auth code\n3. Use \`/confirm-code <code>\``;
    } else if (pendingAuth.status === "code_shown") {
      nextSteps = `\n**Your Code:** \`${pendingAuth.authCode}\`\n**Next Step:** Use \`/confirm-code ${pendingAuth.authCode}\``;
    } else if (pendingAuth.status === "code_confirmed") {
      nextSteps = "\n⏳ Waiting for staff to approve your request.";
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
