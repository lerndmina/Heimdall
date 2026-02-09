/**
 * /mcstatus add|remove|list|get|send — Monitor Minecraft server status
 *
 * Pings servers via mcstatus.io API. Supports persistent auto-updating
 * status embeds in a channel.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import McServerStatus from "../models/McServerStatus.js";
import { pingMcServer, createStatusEmbed } from "../utils/mcstatus-utils.js";
import { beginPersistentLoop } from "../events/ready/checkservers.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:mcstatus");

export const data = new SlashCommandBuilder()
  .setName("mcstatus")
  .setDescription("Check the status of a Minecraft server")
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a Minecraft server to monitor")
      .addStringOption((opt) => opt.setName("server-ip").setDescription("The IP address of the server").setRequired(true))
      .addStringOption((opt) => opt.setName("server-name").setDescription("A display name for the server").setRequired(true))
      .addIntegerOption((opt) => opt.setName("server-port").setDescription("The port (default: 25565)").setRequired(false).setMinValue(1).setMaxValue(65535)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a Minecraft server from the list")
      .addStringOption((opt) => opt.setName("server-name").setDescription("The name of the server").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List all monitored Minecraft servers"))
  .addSubcommand((sub) =>
    sub
      .setName("get")
      .setDescription("Get the current status of a Minecraft server")
      .addStringOption((opt) => opt.setName("server-name").setDescription("The name of the server").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("send")
      .setDescription("Send a status embed to a channel")
      .addStringOption((opt) => opt.setName("server-name").setDescription("The name of the server").setRequired(true))
      .addChannelOption((opt) => opt.setName("channel").setDescription("The channel to send the status to").setRequired(true))
      .addBooleanOption((opt) => opt.setName("persistent").setDescription("Keep the message automatically updated").setRequired(false)),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "add") {
    const serverIp = interaction.options.getString("server-ip", true);
    const serverName = interaction.options.getString("server-name", true);
    const serverPort = interaction.options.getInteger("server-port") ?? 25565;

    // Check if already exists
    const existing = await McServerStatus.findOne({ id: serverName.toLowerCase() });
    if (existing) {
      await interaction.editReply("❌ A server with that name already exists.");
      return;
    }

    if (serverPort < 1 || serverPort > 65535) {
      await interaction.editReply("❌ Invalid port number.");
      return;
    }

    // Verify server is reachable
    const serverDoc = { serverIp, serverPort, serverName };
    let pingData;
    try {
      pingData = await pingMcServer(serverDoc);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`❌ ${msg}\n\nThe server needs to be online to be added.`);
      return;
    }

    await McServerStatus.findOneAndUpdate(
      { id: serverName.toLowerCase() },
      {
        id: serverName.toLowerCase(),
        guildId,
        serverIp,
        serverPort,
        serverName,
        lastPingData: pingData,
        lastPingTime: new Date(),
      },
      { upsert: true, new: true },
    );

    await interaction.editReply(`✅ Server **${serverName}** (\`${serverIp}:${serverPort}\`) added.`);
    return;
  }

  if (subcommand === "remove") {
    const serverName = interaction.options.getString("server-name", true);
    const server = await McServerStatus.findOne({ id: serverName.toLowerCase(), guildId });
    if (!server) {
      await interaction.editReply("❌ Server not found.");
      return;
    }
    await McServerStatus.deleteOne({ id: serverName.toLowerCase() });
    await interaction.editReply(`✅ Server **${server.serverName}** removed.`);
    return;
  }

  if (subcommand === "list") {
    const servers = await McServerStatus.find({ guildId }).lean();
    if (!servers.length) {
      await interaction.editReply("No servers are being monitored. Use `/mcstatus add` to add one.");
      return;
    }

    const lines = servers.map((s) => {
      const persistent = s.persistData ? " 🔄" : "";
      return `• **${s.serverName}** — \`${s.serverIp}:${s.serverPort}\`${persistent}`;
    });

    const embed = pluginAPI.lib.createEmbedBuilder().setTitle("📋 Monitored Servers").setDescription(lines.join("\n")).setFooter({ text: "🔄 = auto-updating embed active" });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "get") {
    const serverName = interaction.options.getString("server-name", true);
    const server = await McServerStatus.findOne({ id: serverName.toLowerCase(), guildId }).lean();
    if (!server) {
      await interaction.editReply("❌ Server not found.");
      return;
    }

    try {
      const pingData = await pingMcServer(server);
      const embedData = createStatusEmbed(pingData, server, client);

      // Save ping results to DB
      await McServerStatus.findOneAndUpdate(
        { id: serverName.toLowerCase(), guildId },
        { lastPingData: pingData, lastPingTime: new Date() },
      );

      await interaction.editReply(embedData);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`❌ ${msg}`);
    }
    return;
  }

  if (subcommand === "send") {
    const serverName = interaction.options.getString("server-name", true);
    const channel = interaction.options.getChannel("channel", true);
    const persistent = interaction.options.getBoolean("persistent") ?? false;

    if (channel.type !== ChannelType.GuildText) {
      await interaction.editReply("❌ Channel must be a text channel.");
      return;
    }

    const server = await McServerStatus.findOne({ id: serverName.toLowerCase(), guildId });
    if (!server) {
      await interaction.editReply("❌ Server not found. Add it first with `/mcstatus add`.");
      return;
    }

    let pingData;
    try {
      pingData = await pingMcServer(server);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`❌ ${msg}`);
      return;
    }

    // Save ping results to DB
    server.lastPingData = pingData;
    server.lastPingTime = new Date();

    const resolvedChannel = await client.channels.fetch(channel.id);
    if (!resolvedChannel?.isTextBased() || !("send" in resolvedChannel)) {
      await interaction.editReply("❌ Cannot send messages to that channel.");
      return;
    }

    const embedData = createStatusEmbed(pingData, { ...server.toObject(), persistData: persistent ? ({} as never) : undefined }, client);
    const message = await resolvedChannel.send(embedData);

    if (persistent) {
      const updateInterval = 61 * 1000;
      server.persistData = { messageId: message.id, channelId: channel.id, updateInterval, lastUpdate: new Date() };
      await server.save();

      // Start the polling loop
      beginPersistentLoop(client, server.toObject(), pluginAPI.lib);

      await interaction.editReply(`✅ Status embed sent and will auto-update every ~60 seconds.`);
    } else {
      await interaction.editReply(`✅ Status embed sent to <#${channel.id}>.`);
    }
  }
}
