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
      MinecraftAuthPending,
      {
        guildId,
        discordId,
        status: { $ne: "expired" },
        expiresAt: { $lte: new Date() },
      },
      { status: "expired" }
    )
  );

  // Find the pending auth record (must not be expired)
  const { data: pendingAuth, error: pendingError } = await tryCatch(
    MinecraftAuthPending.findOne({
      guildId,
      discordId,
      authCode: code,
      status: { $in: ["awaiting_connection", "code_shown"] },
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

  // Check if the auth has expired
  if (new Date() > pendingAuth.expiresAt) {
    // Clean up expired auth
    await tryCatch(
      db.findOneAndUpdate(MinecraftAuthPending, { _id: pendingAuth._id }, { status: "expired" })
    );

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "⏰ Code Expired",
          "Your authentication code has expired.\n\n" +
            "Please run `/link-minecraft <username>` to start a new link request."
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
            config.minecraftServerIp +
            ":" +
            config.minecraftServerPort +
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
      MinecraftAuthPending,
      { _id: pendingAuth._id },
      {
        status: "code_confirmed",
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
  const approvalMessage = config.requireApproval
    ? "Your request is now **pending staff approval**. You'll be notified when a staff member reviews your request."
    : "Your account will be automatically approved shortly.";

  return interaction.editReply({
    embeds: [
      BasicEmbed(
        client,
        "✅ Code Confirmed",
        `**Authentication Successful!**\n\n` +
          `Your Discord account is now linked to **${pendingAuth.minecraftUsername}**.\n\n` +
          approvalMessage +
          `\n\n` +
          `Use \`/minecraft-status\` to check your current status.`
      )
        .setColor("Green")
        .setFooter({ text: "You'll receive a DM when your status changes" }),
    ],
  });
}
