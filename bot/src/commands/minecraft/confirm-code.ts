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
  .setName("confirm-code")
  .setDescription("Confirm your Minecraft authentication code")
  .addStringOption((option) =>
    option
      .setName("code")
      .setDescription("The 6-digit code you received when trying to join the server")
      .setRequired(true)
      .setMinLength(6)
      .setMaxLength(6)
  )
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: !env.ENABLE_MINECRAFT_SYSTEMS,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;
  const code = interaction.options.getString("code", true);

  const db = new Database();

  // Validate code format (6 digits)
  if (!/^\d{6}$/.test(code)) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Invalid Code",
          "Authentication codes must be exactly 6 digits."
        ).setColor("Red"),
      ],
    });
  }

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

  // Clean up any expired pending auth records for this user
  await tryCatch(
    db.updateMany(
      MinecraftPlayer,
      {
        guildId,
        discordId,
        authCode: { $ne: null },
        linkedAt: null,
        expiresAt: { $lte: new Date() },
      },
      { authCode: null, expiresAt: null } // Clear expired auths
    )
  );

  // Find the pending auth record (must not be expired)
  const { data: pendingAuth, error: pendingError } = await tryCatch(
    MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: code,
      linkedAt: null, // Not yet linked
      expiresAt: { $gt: new Date() }, // Ensure it hasn't expired
    }).lean()
  );

  if (pendingError) {
    log.error("Failed to find pending auth:", pendingError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "❌ Error", "Failed to verify code. Please try again later.").setColor(
          "Red"
        ),
      ],
    });
  }

  if (!pendingAuth) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Invalid Code",
          "No pending authentication found with that code.\n\n" +
            "Make sure you:\n" +
            "• Used the correct 6-digit code\n" +
            "• Got the code by trying to join the Minecraft server\n" +
            "• Haven't already confirmed this code\n\n" +
            "Need to start over? Use `/link-minecraft <username>`"
        ).setColor("Red"),
      ],
    });
  }

  // Check if they actually got the code from the server (security check)
  if (!pendingAuth.codeShownAt) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Invalid Process",
          "You must try joining the Minecraft server first to receive your code.\n\n" +
            "**Steps:**\n" +
            "1. Join: `" +
            config.serverHost +
            ":" +
            config.serverPort +
            "`\n" +
            "2. Get kicked with your code\n" +
            "3. Come back and use `/confirm-code <code>`"
        ).setColor("Red"),
      ],
    });
  }

  // Update the pending auth to confirmed status
  const { error: updateError } = await tryCatch(
    db.findOneAndUpdate(
      MinecraftPlayer,
      { _id: pendingAuth._id },
      {
        confirmedAt: new Date(),
      }
    )
  );

  if (updateError) {
    log.error("Failed to update pending auth status:", updateError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "❌ Error", "Failed to confirm code. Please try again later.").setColor(
          "Red"
        ),
      ],
    });
  }

  // Success response
  const approvalMessage = !config.autoWhitelist
    ? "Your request is now **pending staff approval**. Staff will review your request manually and approve it when they're available. This process may take some time - please be patient!"
    : "Your account will be automatically approved shortly.";

  return interaction.editReply({
    embeds: [
      BasicEmbed(
        client,
        "✅ Code Confirmed",
        `**Authentication Successful!**\n\n` +
          `Your Discord account is now linked to **${pendingAuth.minecraftUsername}**.\n\n` +
          `⏳ ${approvalMessage}\n\n` +
          `**What happens next:**\n` +
          `• Staff will review your request in the queue\n` +
          `• You'll get a DM notification when approved\n` +
          `• Then you can join the Minecraft server!\n\n` +
          `Use \`/minecraft-status\` to check your current status.`
      )
        .setColor("Yellow")
        .setFooter({ text: "Please wait patiently for staff approval" }),
    ],
  });
}
