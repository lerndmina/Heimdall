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
  .setName("link-minecraft")
  .setDescription("Link your Discord account to your Minecraft account")
  .addStringOption((option) =>
    option.setName("username").setDescription("Your Minecraft username").setRequired(true)
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
  const minecraftUsername = interaction.options.getString("username", true).toLowerCase();

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

  // Validate minecraft username format
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(minecraftUsername)) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Invalid Username",
          "Minecraft usernames must be 3-16 characters long and contain only letters, numbers, and underscores."
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

  // Check if user already has a pending auth
  const { data: existingPending, error: pendingError } = await tryCatch(
    MinecraftPlayer.findOne({
      guildId,
      discordId,
      authCode: { $ne: null },
      linkedAt: null,
      expiresAt: { $gt: new Date() }, // Only get non-expired records
    }).lean()
  );

  if (pendingError) {
    log.error("Failed to check existing pending auth:", pendingError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check existing requests. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  if (existingPending) {
    // Check if they're trying to link a different username
    if (existingPending.minecraftUsername.toLowerCase() !== minecraftUsername.toLowerCase()) {
      // Update the existing pending request with the new username
      const { error: updateError } = await tryCatch(
        db.findOneAndUpdate(
          MinecraftPlayer,
          { _id: existingPending._id },
          {
            minecraftUsername,
            codeShownAt: null, // Reset this since they haven't seen the code for the new username
          }
        )
      );

      if (updateError) {
        log.error("Failed to update pending auth username:", updateError);
        return interaction.editReply({
          embeds: [
            BasicEmbed(
              client,
              "❌ Error",
              "Failed to update username. Please try again later."
            ).setColor("Red"),
          ],
        });
      }

      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "✏️ Username Updated",
            `Your pending link request has been updated to **${minecraftUsername}**.\n\n` +
              `**Next Steps:**\n` +
              `1. Try joining the Minecraft server: \`${config.serverHost}:${config.serverPort}\`\n` +
              `2. You'll be kicked with your authentication code\n` +
              `3. Use that code with \`/confirm-code <code>\`\n\n` +
              `**Request expires:** <t:${Math.floor(
                (existingPending.expiresAt || new Date()).getTime() / 1000
              )}:R>`
          ).setColor("Yellow"),
        ],
      });
    }

    // Same username - just remind them of the process (NO CODE SHOWN!)
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "⏳ Pending Request",
          `You already have a pending link request for **${existingPending.minecraftUsername}**.\n\n` +
            `**To complete linking:**\n` +
            `1. Try joining the Minecraft server: \`${config.serverHost}:${config.serverPort}\`\n` +
            `2. You'll be kicked with your authentication code\n` +
            `3. Use that code with \`/confirm-code <code>\`\n\n` +
            `**Request expires:** <t:${Math.floor(
              (existingPending.expiresAt || new Date()).getTime() / 1000
            )}:R>\n\n` +
            `*Want to change the username? Just run this command again with a different username.*`
        ).setColor("Yellow"),
      ],
    });
  }

  // Check if this Discord account is already linked to a different Minecraft account
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
          "Failed to check existing links. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  if (existingPlayer) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Already Linked",
          `Your Discord account is already linked to **${existingPlayer.minecraftUsername}**.\n\n` +
            `Use \`/minecraft-status\` to see your current status.`
        ).setColor("Red"),
      ],
    });
  }

  // Check if this Minecraft username is already linked to a different Discord account
  const { data: existingMinecraftPlayer, error: mcPlayerError } = await tryCatch(
    MinecraftPlayer.findOne({ guildId, minecraftUsername, discordId: { $ne: null } }).lean()
  );

  if (mcPlayerError) {
    log.error("Failed to check existing minecraft player:", mcPlayerError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check username availability. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  if (existingMinecraftPlayer) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Username Taken",
          `The Minecraft username **${minecraftUsername}** is already linked to another Discord account.`
        ).setColor("Red"),
      ],
    });
  }

  // Generate unique 6-digit auth code
  let authCode: string;
  let codeIsUnique = false;
  let attempts = 0;

  while (!codeIsUnique && attempts < 10) {
    authCode = Math.floor(100000 + Math.random() * 900000).toString();
    const { data: existingCode } = await tryCatch(db.findOne(MinecraftPlayer, { authCode }));
    if (!existingCode) {
      codeIsUnique = true;
    }
    attempts++;
  }

  if (!codeIsUnique) {
    log.error("Failed to generate unique auth code after 10 attempts");
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to generate authentication code. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  // Create pending auth record
  const expiresAt = new Date(Date.now() + config.authCodeExpiry * 1000);

  // Get user data for storage
  const member = await interaction.guild?.members.fetch(discordId).catch(() => null);
  const discordUsername = interaction.user.username;
  const discordDisplayName =
    member?.displayName || interaction.user.globalName || interaction.user.username;

  const { error: createError } = await tryCatch(
    (async () => {
      const pendingAuth = new MinecraftPlayer({
        guildId,
        discordId,
        minecraftUsername,
        authCode: authCode!,
        expiresAt,
        discordUsername,
        discordDisplayName,
        source: "command",
      });
      await pendingAuth.save();
    })()
  );

  if (createError) {
    log.error("Failed to create pending auth:", createError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to create authentication request. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  // Success response
  return interaction.editReply({
    embeds: [
      BasicEmbed(
        client,
        "🎮 Link Request Created",
        `**Step 1 Complete!** Your authentication request has been created.\n\n` +
          `**Next Steps:**\n` +
          `1. Try joining the Minecraft server: \`${config.serverHost}:${config.serverPort}\`\n` +
          `2. You'll be kicked with your authentication code\n` +
          `3. Come back here and use \`/confirm-code <your-code>\`\n` +
          `4. **Wait for staff approval** - This may take some time\n\n` +
          `⏰ **Important:** Staff must manually approve your whitelist request before you can join the server.\n\n` +
          `**Your request expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
      )
        .setColor("Yellow")
        .setFooter({ text: "Your authentication code will be shown when you try to join" }),
    ],
  });
}
