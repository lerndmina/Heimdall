import type { SlashCommandProps, CommandOptions, AutocompleteProps } from "commandkit";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  EmbedField,
  InteractionEditReplyOptions,
  MessagePayload,
  SlashCommandBuilder,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import Database from "../../utils/data/database";
import McServerStatus, {
  McServerStatusType,
  MessagePersistType,
} from "../../models/McServerStatus";
import { tryCatch } from "../../utils/trycatch";
import { beginPersistantLoop, McPingResponse, pingMcServer } from "../../events/ready/checkservers";
import log from "../../utils/log";
import { debugMsg, stripMotdColor, ThingGetter } from "../../utils/TinyUtils";
import { connect } from "http2";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("mcstatus")
  .setDescription("Check the status of a Minecraft server")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("add")
      .setDescription("Add a Minecraft server to the list")
      .addStringOption((option) =>
        option.setName("server-ip").setDescription("The IP address of the server").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("server-name").setDescription("The name of the server").setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName("server-port").setDescription("The port of the server").setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("remove")
      .setDescription("Remove a Minecraft server from the list")
      .addStringOption((option) =>
        option.setName("server-name").setDescription("The name of the server").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all Minecraft servers")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("get")
      .setDescription("Get the status of a Minecraft server")
      .addStringOption((option) =>
        option.setName("server-name").setDescription("The name of the server").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("send")
      .setDescription("Send the status of a Minecraft server to a channel")
      .addStringOption((option) =>
        option.setName("server-name").setDescription("The name of the server").setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send the status to")
          .setRequired(true)
      )
      .addBooleanOption((option) =>
        option
          .setName("persistent")
          .setDescription("Whether to keep the message updated")
          .setRequired(false)
      )
  )
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);

  const subcommand = interaction.options.getSubcommand();
  const db = new Database();
  const guildId = interaction.guildId!;
  const serverIp = interaction.options.getString("server-ip")!;
  const serverPort = interaction.options.getInteger("server-port") ?? 25565;
  const serverName = interaction.options.getString("server-name")!;
  const chosenChannel = interaction.options.getChannel("channel")!;
  const persistent = interaction.options.getBoolean("persistent") ?? false;

  const runWithSafety = async () => {
    if (subcommand === "add") {
      const existingServer = await db.findOne(McServerStatus, { id: serverName.toLowerCase() });
      if (existingServer) return "Server already exists";
      if (serverPort < 1 || serverPort > 65535) return "Invalid port number";
      if (!serverIp) return "Invalid IP address";
      const server = new McServerStatus({
        id: serverName.toLowerCase(),
        guildId,
        serverIp,
        serverPort,
        serverName,
      });

      const { data: mcPingData, error: mcPingError } = await tryCatch(pingMcServer(server));
      if (mcPingError) return `${mcPingError.message}\n\nThe server needs to be online to be added`;
      await db.findOneAndUpdate(McServerStatus, { guildId, serverName }, server, {
        upsert: true,
        new: true,
      });
      return `Server ${serverName} added`;
    }

    if (subcommand === "remove") {
      const serverName = interaction.options.getString("server-name")!;
      const server = await db.findOne(McServerStatus, { id: serverName.toLowerCase() });
      if (!server) return "Server not found";
      await db.deleteOne(McServerStatus, { id: serverName.toLowerCase() });
      return `Server ${serverName} removed`;
    }

    if (subcommand === "list") {
      const servers = await db.find(McServerStatus, { guildId });
      if (!servers) return "No servers found";
      let returnData: string[] = [];
      for (const server of servers) {
        returnData.push(`${server.serverName} - ${server.serverIp}:${server.serverPort}\n`);
      }
      if (returnData.length === 0) return "No servers found";
      return returnData.join("");
    }

    if (subcommand === "get") {
      const serverName = interaction.options.getString("server-name")!;
      const server = await db.findOne(McServerStatus, { id: serverName.toLowerCase() });
      if (!server) return "Server not found";
      setCommandCooldown(globalCooldownKey(interaction.commandName), 120);
      const { data: serverData, error } = await tryCatch(pingMcServer(server));
      if (error) return error.message;
      return {
        ...serverData,
        serverName: server.serverName,
        ip: server.serverIp,
        port: server.serverPort,
      };
    }

    if (subcommand === "send") {
      const getter = new ThingGetter(client);
      const channel = await getter.getChannel(chosenChannel.id);
      if (!channel) return "Channel not found";
      if (channel.type !== ChannelType.GuildText) return "Channel must be a text channel";
      const server = await db.findOne(McServerStatus, { id: serverName.toLowerCase() });
      if (!server) return "Server not found please add it first";
      const { data: serverData, error: fetchError } = await tryCatch(pingMcServer(server));
      if (fetchError) return fetchError.message;
      const msgData = createStatusEmbed(serverData, server, client);
      const message = await channel.send(msgData).catch((error) => {
        log.error("Failed to send message", error);
        return `Failed to send message: ${error.message}`;
      });

      if (typeof message === "string") return message;

      if (persistent) {
        const updateInterval = 61 * 1000;
        await db.findOneAndUpdate(
          McServerStatus,
          { id: serverName.toLowerCase() },
          { persistData: { messageId: message.id, channelId: channel.id, updateInterval } }
        );
        beginPersistantLoop(client, server, getter);
        return `Message sent and will be updated every ${updateInterval / 1000} seconds`;
      }
    }

    return "Unknown subcommand";
  };

  const { data, error } = await tryCatch(runWithSafety());

  if (error) {
    await interaction.editReply({ content: error.message });
    return;
  }

  if (typeof data === "string") return await interaction.editReply({ content: data });

  const replyData = createStatusEmbed(
    data,
    { serverName: data.serverName, serverIp: data.ip, serverPort: data.port },
    client
  );

  // Send the reply with both the embed and the attachment
  await interaction.editReply(replyData);
}

export function createStatusEmbed(
  data: McPingResponse,
  dbData:
    | McServerStatusType
    | {
        serverName: string;
        serverIp: string;
        serverPort: number;
        persistData?: MessagePersistType;
      },
  client: Client
) {
  let faviconAttachment: { attachment: Buffer; name: string } | undefined;
  if (data && data.online) {
    // Convert the base64 favicon to a Buffer if it exists
    if (data.icon && data.icon.startsWith("data:image/png;base64,")) {
      try {
        // Extract the base64 part (remove the data:image/png;base64, prefix)
        const base64Data = data.icon.replace(/^data:image\/png;base64,/, "");
        // Create a buffer from the base64 string
        const imageBuffer = Buffer.from(base64Data, "base64");
        // Create an attachment with a name for the file
        faviconAttachment = { attachment: imageBuffer, name: "server-icon.png" };
      } catch (error) {
        console.error("Error converting favicon to attachment:", error);
      }
    }
  }

  const fields: EmbedField[] = [
    { name: "Server Name", value: dbData.serverName, inline: true },
    { name: "Server IP", value: dbData.serverIp, inline: true },
    { name: "Server Port", value: dbData.serverPort.toString(), inline: true },
    { name: "Status", value: data.online ? "Online" : "Offline", inline: true },
  ];

  let isMaintenance = false;

  if (data.online) {
    fields.push({
      name: "Players",
      value: `${data.players.online}/${data.players.max}`,
      inline: true,
    });
    fields.push({
      name: "Version",
      value: data.version.name_clean,
      inline: true,
    });
    if (data.motd.clean.includes("maintenance")) {
      isMaintenance = true;
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const nextUpdate = data.nextPingInSeconds + nowSeconds;

  if (dbData.persistData) {
    fields.push({ name: "Next Update", value: `<t:${nextUpdate}:R>`, inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Server Status for ${dbData.serverName}`)
    .setColor(data.online ? (isMaintenance ? "DarkOrange" : "Green") : "Red")
    .setDescription(data.online ? data.motd.clean : "Server is offline")
    .setURL(`https://mcstatus.io/status/java/${dbData.serverIp}:${dbData.serverPort}`)
    .setFooter({ text: "Last updated", iconURL: client.user?.displayAvatarURL() })
    .addFields(fields)
    .setTimestamp();

  // If we have a favicon, set it as the thumbnail using the attachment URL
  if (faviconAttachment) {
    embed.setThumbnail("attachment://server-icon.png");
  }

  return { embeds: [embed], files: faviconAttachment ? [faviconAttachment] : [], content: "" };
}
