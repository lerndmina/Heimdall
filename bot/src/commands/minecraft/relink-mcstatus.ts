/**
 * Context Menu Command: Relink MC Status
 *
 * This command allows administrators to relink broken mcstatus messages to their persistence system.
 * It's designed to fix cases where persistent server status messages lose their connection to the
 * database, causing them to stop updating automatically.
 *
 * The command automatically extracts the server name from the message embed, searches the database
 * for matching servers, and reestablishes the persistent update loop.
 *
 * Usage:
 * 1. Right-click on a mcstatus message that has stopped updating
 * 2. Select "Relink MC Status" from the context menu
 * 3. The command automatically searches by server name from the embed
 * 4. If multiple matches found, it displays them for manual selection
 * 5. If found, the persistence is reestablished and the update loop restarts
 *
 * Features:
 * - Automatic server name extraction from embed
 * - Smart database search with partial name matching
 * - Multiple match handling for manual selection
 * - Full persistence restoration with update loop restart
 * - Comprehensive error handling and logging
 *
 * Requirements:
 * - User must have "Manage Messages" permission
 * - Target message must have mcstatus-like embed (title contains "Server Status for")
 * - Message must have a valid server status embed with server information
 */

import type { CommandData, ContextMenuCommandProps, CommandOptions } from "commandkit";
import {
  ApplicationCommandType,
  MessageFlags,
  MessageContextMenuCommandInteraction,
  Message,
} from "discord.js";
import Database from "../../utils/data/database";
import McServerStatus, { McServerStatusType } from "../../models/McServerStatus";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import { beginPersistantLoop, pingMcServer } from "../../events/ready/checkservers";
import { ThingGetter } from "../../utils/TinyUtils";
import { createStatusEmbed } from "./mcstatus";

const db = new Database();

export const data: CommandData = {
  name: "Relink MC Status",
  type: ApplicationCommandType.Message,
};

export async function run({ interaction, client, handler }: ContextMenuCommandProps) {
  // Type guard to ensure this is a message context menu
  if (!interaction.isMessageContextMenuCommand()) {
    return;
  }

  // Check if user has manage messages permission
  if (!interaction.memberPermissions?.has("ManageMessages")) {
    return interaction.reply({
      content: "❌ You need the `Manage Messages` permission to use this command.",
      ephemeral: true,
    });
  }

  const targetMessage = interaction.targetMessage;

  // Check if this looks like a mcstatus message (has server status embed)
  const embed = targetMessage.embeds[0];
  if (!embed || !embed.title?.includes("Server Status for")) {
    return interaction.reply({
      content:
        "❌ This doesn't appear to be a server status message (no server status embed found).",
      ephemeral: true,
    });
  }

  // Extract server name from the embed title
  // Title format: "Server Status for ServerName"
  let serverName = "";
  const titleMatch = embed.title.match(/^Server Status for (.+)$/);
  if (titleMatch) {
    serverName = titleMatch[1].trim();
  }

  if (!serverName) {
    return interaction.reply({
      content:
        "❌ Could not extract server name from the embed title. Expected format: 'Server Status for ServerName'",
      ephemeral: true,
    });
  }

  // Extract additional server info from embed fields for validation
  let extractedServerIp = "";
  let extractedServerPort = "";

  const ipField = embed.fields?.find((field) => field.name === "Server IP");
  const portField = embed.fields?.find((field) => field.name === "Server Port");

  if (ipField) extractedServerIp = ipField.value;
  if (portField) extractedServerPort = portField.value;

  log.debug("Extracted server info from message", {
    serverName,
    extractedServerIp,
    extractedServerPort,
    embedTitle: embed.title,
    fieldsCount: embed.fields?.length,
  });

  // Try to find the server using name and validate with IP/port
  try {
    await interaction.reply({
      content: "🔍 Searching for server in database...",
      ephemeral: true,
    });

    const searchResult = await findServerByName(
      serverName,
      extractedServerIp,
      extractedServerPort,
      interaction.guildId!
    );

    if (searchResult.found && searchResult.server) {
      // Found exactly one match, proceed with relinking
      await relinkMcStatus(interaction, searchResult.server, targetMessage, client);
    } else if (searchResult.multipleFound) {
      // Multiple matches found, show them for manual selection
      let message = `Found ${searchResult.servers!.length} matching servers:\n\n`;
      searchResult.servers!.forEach((s, i) => {
        message += `${i + 1}. **${s.serverName}**\n   IP: \`${s.serverIp}:${
          s.serverPort
        }\`\n   ID: \`${s.id}\`\n\n`;
      });
      message +=
        "Please check the server details and ensure the correct message is being relinked.";

      await interaction.editReply({
        content: message.substring(0, 2000), // Discord limit
      });
    } else {
      // No matches found
      await interaction.editReply({
        content: `❌ Could not find server with name "${serverName}" in this guild.\n\nMake sure the server exists in the database first using \`/mcstatus add\`.`,
      });
    }
  } catch (error) {
    log.error("Error searching for server:", error);
    await interaction.editReply({
      content:
        "❌ Error searching for server. Please check the server configuration and try again.",
    });
  }
}

// Helper function to search for servers by name and validate with IP/port
async function findServerByName(name: string, ip: string, port: string, guildId: string) {
  try {
    // Search for servers with matching name in the guild
    const servers = await McServerStatus.find({
      guildId: guildId,
      serverName: { $regex: name, $options: "i" }, // Case-insensitive partial match
    }).limit(5); // Limit to prevent overwhelming results

    if (servers.length === 0) {
      return { found: false, multipleFound: false, servers: [] };
    } else if (servers.length === 1) {
      // Validate the single match with IP/port if available
      const server = servers[0];
      if (ip && server.serverIp !== ip) {
        log.warn("Server IP mismatch during relink", {
          expectedIp: ip,
          foundIp: server.serverIp,
          serverName: server.serverName,
        });
      }
      if (port && server.serverPort.toString() !== port) {
        log.warn("Server port mismatch during relink", {
          expectedPort: port,
          foundPort: server.serverPort.toString(),
          serverName: server.serverName,
        });
      }
      return { found: true, multipleFound: false, server: servers[0], servers };
    } else {
      return { found: false, multipleFound: true, servers };
    }
  } catch (error) {
    log.error("Error searching servers:", error);
    return { found: false, multipleFound: false, servers: [] };
  }
}

// Helper function to relink a mcstatus message
async function relinkMcStatus(
  interaction: MessageContextMenuCommandInteraction,
  server: McServerStatusType,
  targetMessage: Message,
  client: any
) {
  try {
    log.debug("Relinking mcstatus message", {
      serverId: server.id,
      serverName: server.serverName,
      messageId: targetMessage.id,
      channelId: targetMessage.channelId,
    });

    // Check if this server already has persistence data (potential duplicate loop)
    if (server.persistData) {
      log.info("Server already has persistence data, updating with new message info", {
        serverId: server.id,
        oldMessageId: server.persistData.messageId,
        newMessageId: targetMessage.id,
      });
    }

    // Set up the persistence data
    const updateInterval = 61 * 1000; // Default 61 seconds like in the original command
    const persistData = {
      messageId: targetMessage.id,
      channelId: targetMessage.channelId,
      updateInterval,
      lastUpdate: new Date(),
    };

    // Update the server's persistence data in the database
    const updatedServer = await db.findOneAndUpdate(
      McServerStatus,
      { id: server.id },
      { persistData },
      { upsert: false, new: true }
    );

    if (!updatedServer) {
      return interaction.editReply({
        content: "❌ Failed to update server persistence data in database.",
      });
    }

    // Perform an immediate update to the message before starting the loop
    log.debug("Performing immediate server status update");

    const { data: immediateUpdateData, error: updateError } = await tryCatch(
      pingMcServer(updatedServer as McServerStatusType)
    );

    if (updateError) {
      log.warn("Failed to ping server for immediate update, will proceed with loop anyway", {
        error: updateError,
        serverName: server.serverName,
      });
    } else {
      // Update the message immediately with fresh data
      const embedData = createStatusEmbed(
        immediateUpdateData,
        updatedServer as McServerStatusType,
        client
      );
      const { error: editError } = await tryCatch(targetMessage.edit(embedData));

      if (editError) {
        log.warn("Failed to edit message with immediate update", { error: editError });
      } else {
        log.debug("Successfully performed immediate message update");
      }
    }

    // Start the persistence loop (this will handle any existing loops naturally since
    // the new loop will take over and the old message reference will become invalid)

    // Use setTimeout with a small delay to ensure the message is fully processed by Discord
    // and the database update is committed before starting the persistence loop
    setTimeout(async () => {
      log.debug("Starting persistence loop with delay", {
        serverId: server.id,
        messageId: targetMessage.id,
        channelId: targetMessage.channelId,
      });

      // Fetch the updated server data from database to ensure we have the latest persistData
      const freshServerData = await db.findOne(McServerStatus, { id: server.id });
      if (!freshServerData || !freshServerData.persistData) {
        log.error("Server or persistData not found in database after relink", {
          serverId: server.id,
          serverName: server.serverName,
          foundServer: !!freshServerData,
          foundPersistData: !!freshServerData?.persistData,
        });
        return;
      }

      log.debug("Found fresh server data from database", {
        serverId: freshServerData.id,
        messageId: freshServerData.persistData.messageId,
        channelId: freshServerData.persistData.channelId,
      });

      const getter = new ThingGetter(client);
      const { error: loopError } = await tryCatch(
        beginPersistantLoop(client, freshServerData as McServerStatusType, getter)
      );

      if (loopError) {
        log.error("Failed to start persistent loop after relink", {
          error: loopError,
          serverId: server.id,
          serverName: server.serverName,
        });

        // Clean up the persistence data if loop failed to start
        await db.findOneAndUpdate(McServerStatus, { id: server.id }, { persistData: null });
      } else {
        log.info("Successfully started persistent loop after relink", {
          serverId: server.id,
          serverName: server.serverName,
          messageId: targetMessage.id,
        });
      }
    }, 3000); // 3 second delay to allow Discord API and database to catch up

    log.info("Successfully relinked mcstatus message", {
      serverId: server.id,
      serverName: server.serverName,
      messageId: targetMessage.id,
      channelId: targetMessage.channelId,
      updateInterval,
      hadPreviousPersistence: !!server.persistData,
    });

    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ MC Status Relinked",
          `Successfully relinked server status message to persistence system!\n\n**Server:** ${
            server.serverName
          }\n**IP:** ${server.serverIp}:${server.serverPort}\n**Channel:** <#${
            targetMessage.channelId
          }>\n**Update Interval:** ${
            updateInterval / 1000
          } seconds\n\nThe message has been updated immediately and will continue updating automatically.`,
          undefined,
          "Green"
        ),
      ],
    });
  } catch (error) {
    log.error("Error relinking mcstatus message:", error);
    await interaction.editReply({
      content: "❌ An error occurred while relinking the server status message. Please try again.",
    });
  }
}

export const options: CommandOptions = {
  devOnly: false,
  userPermissions: ["ManageMessages"],
  botPermissions: ["SendMessages", "EmbedLinks"],
  deleted: false,
};
