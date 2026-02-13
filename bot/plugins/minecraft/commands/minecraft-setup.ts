/**
 * /minecraft-setup enable|disable|config — Configure Minecraft integration (admin)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:setup");

export const data = new SlashCommandBuilder()
  .setName("minecraft-setup")
  .setDescription("Configure Minecraft account linking for this server")
  .addSubcommand((sub) =>
    sub
      .setName("enable")
      .setDescription("Enable Minecraft account linking")
      .addStringOption((opt) => opt.setName("server-ip").setDescription("Your Minecraft server IP address").setRequired(true))
      .addRoleOption((opt) => opt.setName("staff-role").setDescription("Role that can approve whitelist requests").setRequired(true))
      .addIntegerOption((opt) => opt.setName("server-port").setDescription("Your Minecraft server port (default: 25565)").setRequired(false).setMinValue(1).setMaxValue(65535)),
  )
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable Minecraft account linking"))
  .addSubcommand((sub) => sub.setName("config").setDescription("View current configuration"))
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Send the Minecraft linking panel to a channel")
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post the linking panel in").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("messages")
      .setDescription("Customize authentication and kick messages")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Which message to customize")
          .setRequired(true)
          .addChoices(
            { name: "Welcome Back (Whitelisted)", value: "authSuccessMessage" },
            { name: "Not Whitelisted", value: "authRejectionMessage" },
            { name: "Auth Code Shown", value: "authPendingMessage" },
            { name: "Application Rejected", value: "applicationRejectionMessage" },
          ),
      )
      .addStringOption((opt) => opt.setName("message").setDescription("The message text (use {code} for auth code, {player} for username). Leave empty to reset.").setRequired(false)),
  );

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
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "enable") {
    const serverIp = interaction.options.getString("server-ip", true);
    const serverPort = interaction.options.getInteger("server-port") ?? 25565;
    const staffRole = interaction.options.getRole("staff-role", true);

    if (!/^[a-zA-Z0-9.-]+$/.test(serverIp)) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Invalid Server IP").setDescription("Server IP can only contain letters, numbers, dots, and hyphens.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    try {
      await MinecraftConfig.findOneAndUpdate(
        { guildId },
        {
          guildId,
          enabled: true,
          serverHost: serverIp,
          serverPort,
          staffRoleId: staffRole.id,
          autoLinkOnJoin: false,
          autoWhitelist: false,
          requireConfirmation: true,
          allowUsernameChange: true,
          maxPendingAuths: 10,
          authCodeExpiry: 300,
        },
        { upsert: true, new: true },
      );
    } catch (error) {
      log.error("Failed to enable config:", error);
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Error").setDescription("Failed to save configuration.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Minecraft Linking Enabled")
      .setDescription(
        `**Configuration saved successfully!**\n\n` +
          `**Server:** \`${serverIp}:${serverPort}\`\n` +
          `**Staff Role:** ${staffRole}\n` +
          `**Approval Required:** Yes\n` +
          `**Code Expiry:** 5 minutes\n\n` +
          `Users can now use \`/link-minecraft <username>\`.`,
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "disable") {
    await MinecraftConfig.findOneAndUpdate({ guildId }, { enabled: false });
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Minecraft Linking Disabled").setDescription("Minecraft account linking has been disabled.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "config") {
    const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
    if (!mcConfig) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Configured").setDescription("Use `/minecraft-setup enable` first.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const staffRole = mcConfig.staffRoleId ? interaction.guild?.roles.cache.get(mcConfig.staffRoleId) : null;

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("⚙️ Minecraft Configuration")
      .setDescription("Current server configuration:")
      .setColor(mcConfig.enabled ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: "Status", value: mcConfig.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Server", value: `${mcConfig.serverHost}:${mcConfig.serverPort}`, inline: true },
        { name: "Staff Role", value: staffRole ? staffRole.toString() : "❌ Role not found", inline: true },
        { name: "Approval Required", value: mcConfig.autoWhitelist ? "No" : "Yes", inline: true },
        { name: "Code Expiry", value: `${mcConfig.authCodeExpiry} seconds`, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  }

  if (subcommand === "panel") {
    const channel = interaction.options.getChannel("channel", true);

    const result = await pluginAPI.panelService.sendPanel(channel.id, guildId, undefined);

    if (result.success) {
      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ Panel Sent")
        .setDescription(`The Minecraft linking panel has been posted to <#${channel.id}>.\n\n[Jump to panel](${result.messageUrl})`);
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Failed to Send Panel")
        .setDescription(result.error || "An error occurred.");
      await interaction.editReply({ embeds: [embed] });
    }
    return;
  }

  if (subcommand === "messages") {
    const messageType = interaction.options.getString("type", true) as "authSuccessMessage" | "authRejectionMessage" | "authPendingMessage" | "applicationRejectionMessage";
    const newMessage = interaction.options.getString("message");

    const mcConfig = await MinecraftConfig.findOne({ guildId });
    if (!mcConfig) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Configured").setDescription("Use `/minecraft-setup enable` first.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const typeLabels: Record<string, string> = {
      authSuccessMessage: "Welcome Back (Whitelisted)",
      authRejectionMessage: "Not Whitelisted",
      authPendingMessage: "Auth Code Shown",
      applicationRejectionMessage: "Application Rejected",
    };

    if (!newMessage) {
      // Reset to default
      mcConfig[messageType] = undefined as unknown as string;
      await mcConfig.save();

      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Message Reset").setDescription(`The **${typeLabels[messageType]}** message has been reset to the default.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    mcConfig[messageType] = newMessage;
    await mcConfig.save();

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Message Updated")
      .setDescription(`The **${typeLabels[messageType]}** message has been updated.`)
      .addFields({ name: "New Message", value: `\`\`\`${newMessage}\`\`\`` }, { name: "Placeholders", value: "`{code}` — Auth code\n`{player}` — Player username" });
    await interaction.editReply({ embeds: [embed] });
  }
}
