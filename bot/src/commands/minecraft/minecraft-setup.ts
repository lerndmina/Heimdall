import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import Database from "../../utils/data/database";
import MinecraftConfig from "../../models/MinecraftConfig";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("minecraft-setup")
  .setDescription("Configure Minecraft account linking for this server")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("enable")
      .setDescription("Enable Minecraft account linking")
      .addStringOption((option) =>
        option
          .setName("server-ip")
          .setDescription("Your Minecraft server IP address")
          .setRequired(true)
      )
      .addRoleOption((option) =>
        option
          .setName("staff-role")
          .setDescription("Role that can approve whitelist requests")
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("server-port")
          .setDescription("Your Minecraft server port (default: 25565)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(65535)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("disable").setDescription("Disable Minecraft account linking")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("config").setDescription("View current configuration")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("messages")
      .setDescription("Configure kick messages")
      .addStringOption((option) =>
        option
          .setName("auth-message")
          .setDescription(
            "Message shown when player gets their auth code (use {code} for the code)"
          )
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("no-auth-message")
          .setDescription("Message shown to players who haven't linked (use {username})")
          .setRequired(false)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: !env.ENABLE_MINECRAFT_SYSTEMS,
  userPermissions: ["ManageGuild"],
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const subcommand = interaction.options.getSubcommand();
  const db = new Database();

  if (subcommand === "enable") {
    const serverIp = interaction.options.getString("server-ip", true);
    const serverPort = interaction.options.getInteger("server-port") ?? 25565;
    const staffRole = interaction.options.getRole("staff-role", true);

    // Validate server IP format (basic validation)
    if (!/^[a-zA-Z0-9.-]+$/.test(serverIp)) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Invalid Server IP",
            "Server IP can only contain letters, numbers, dots, and hyphens."
          ).setColor("Red"),
        ],
      });
    }

    // Create or update config
    const configData = {
      guildId,
      enabled: true,
      serverHost: serverIp,
      serverPort: serverPort,
      staffRoleId: staffRole.id,
      autoLinkOnJoin: false, // Default to false
      autoWhitelist: false, // Default to requiring approval
      requireConfirmation: true,
      allowUsernameChange: true,
      maxPendingAuths: 10,
      authCodeExpiry: 300, // 5 minutes default (in seconds)
      authSuccessMessage:
        "§aYour auth code: §f{code}\n§7Go to Discord and type: §f/confirm-code {code}",
      authRejectionMessage:
        "§cTo join this server:\n§7• Join the Discord server\n§7• Use §f/link-minecraft {username}\n§7• Follow the instructions to link your account",
      whitelistSuccessMessage: "§aYou've been whitelisted! Please rejoin the server.",
    };

    const { error: saveError } = await tryCatch(
      db.findOneAndUpdate(MinecraftConfig, { guildId }, configData, { upsert: true, new: true })
    );

    if (saveError) {
      log.error("Failed to save minecraft config:", saveError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to save configuration. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Minecraft Linking Enabled",
          `**Configuration saved successfully!**\n\n` +
            `**Server:** \`${serverIp}:${serverPort}\`\n` +
            `**Staff Role:** ${staffRole}\n` +
            `**Approval Required:** Yes\n` +
            `**Code Expiry:** 15 minutes\n\n` +
            `Users can now use \`/link-minecraft <username>\` to start linking their accounts.\n` +
            `Staff can manage requests via the web dashboard.`
        ).setColor("Green"),
      ],
    });
  }

  if (subcommand === "disable") {
    const { error: updateError } = await tryCatch(
      db.findOneAndUpdate(MinecraftConfig, { guildId }, { enabled: false })
    );

    if (updateError) {
      log.error("Failed to disable minecraft config:", updateError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to update configuration. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Minecraft Linking Disabled",
          "Minecraft account linking has been disabled for this server."
        ).setColor("Green"),
      ],
    });
  }

  if (subcommand === "config") {
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
            "Failed to fetch configuration. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    if (!config) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Not Configured",
            "Minecraft linking is not set up for this server.\n\n" +
              "Use `/minecraft-setup enable` to get started."
          ).setColor("Red"),
        ],
      });
    }

    const staffRole = interaction.guild?.roles.cache.get(config.staffRoleId);

    return interaction.editReply({
      embeds: [
        BasicEmbed(client, "⚙️ Minecraft Configuration", "Current server configuration:")
          .setColor(config.enabled ? "Green" : "Red")
          .addFields([
            { name: "Status", value: config.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
            {
              name: "Server",
              value: `${config.serverHost}:${config.serverPort}`,
              inline: true,
            },
            {
              name: "Staff Role",
              value: staffRole ? staffRole.toString() : "❌ Role not found",
              inline: true,
            },
            {
              name: "Auto-link on Join",
              value: config.autoLinkOnJoin ? "Yes" : "No",
              inline: true,
            },
            {
              name: "Require Approval",
              value: config.autoWhitelist ? "No" : "Yes", // Inverted logic
              inline: true,
            },
            { name: "Code Expiry", value: `${config.authCodeExpiry} seconds`, inline: true },
          ]),
      ],
    });
  }

  if (subcommand === "messages") {
    const authMessage = interaction.options.getString("auth-message");
    const noAuthMessage = interaction.options.getString("no-auth-message");

    if (!authMessage && !noAuthMessage) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ No Messages",
            "Please provide at least one message to update."
          ).setColor("Red"),
        ],
      });
    }

    const updateData: any = {};
    if (authMessage) updateData.authCodeMessage = authMessage;
    if (noAuthMessage) updateData.noAuthMessage = noAuthMessage;

    const { error: updateError } = await tryCatch(
      db.findOneAndUpdate(MinecraftConfig, { guildId }, updateData)
    );

    if (updateError) {
      log.error("Failed to update minecraft messages:", updateError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to update messages. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    let updatedFields: string[] = [];
    if (authMessage) updatedFields.push("Auth code message");
    if (noAuthMessage) updatedFields.push("No-auth message");

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Messages Updated",
          `Successfully updated: ${updatedFields.join(", ")}\n\n` +
            `**Available placeholders:**\n` +
            `• \`{code}\` - The 6-digit auth code\n` +
            `• \`{username}\` - The player's Minecraft username\n` +
            `• \`{serverIp}\` - Your server IP\n` +
            `• \`{serverPort}\` - Your server port`
        ).setColor("Green"),
      ],
    });
  }
}
