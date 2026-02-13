/**
 * "Relink MC Status" — Message context menu command
 *
 * Right-click a broken mcstatus persistent embed to re-establish
 * the persistent polling loop with the new message reference.
 */

import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, type MessageContextMenuCommandInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import McServerStatus from "../models/McServerStatus.js";
import { pingMcServer, createStatusEmbed } from "../utils/mcstatus-utils.js";
import { beginPersistentLoop } from "../events/ready/checkservers.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("minecraft:relink-mcstatus");

export const data = new ContextMenuCommandBuilder().setName("Relink MC Status").setType(ApplicationCommandType.Message);

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;
  const msgInteraction = interaction as unknown as MessageContextMenuCommandInteraction;
  await msgInteraction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await msgInteraction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const guildId = msgInteraction.guildId!;
  const targetMessage = msgInteraction.targetMessage;

  // Must be from this bot
  if (targetMessage.author.id !== client.user?.id) {
    await msgInteraction.editReply("❌ That message isn't from me.");
    return;
  }

  // Must have an embed with "Server Status for" title
  const embed = targetMessage.embeds[0];
  if (!embed?.title?.startsWith("Server Status for ")) {
    await msgInteraction.editReply("❌ That doesn't look like a server status embed.");
    return;
  }

  const serverName = embed.title.replace("Server Status for ", "");

  // Find the server in DB (case-insensitive partial match)
  const server = await McServerStatus.findOne({
    guildId,
    serverName: { $regex: new RegExp(`^${serverName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  });

  if (!server) {
    await msgInteraction.editReply(`❌ No server named **${serverName}** found in this guild's monitored servers.`);
    return;
  }

  // Update persist data to point at this message
  const updateInterval = server.persistData?.updateInterval || 61000;
  server.persistData = {
    messageId: targetMessage.id,
    channelId: targetMessage.channelId,
    updateInterval,
    lastUpdate: new Date(),
  };
  await server.save();

  // Immediate ping + edit
  try {
    const pingData = await pingMcServer(server.toObject());
    const embedData = createStatusEmbed(pingData, server.toObject(), client);
    await targetMessage.edit(embedData);
  } catch (error) {
    log.error(`Failed initial ping for relink of ${server.serverName}:`, error);
  }

  // Start the persistent loop (with a short delay to avoid double-edit)
  setTimeout(() => {
    beginPersistentLoop(client, server.toObject(), pluginAPI.lib);
  }, 3000);

  await msgInteraction.editReply(`✅ Persistent status embed for **${server.serverName}** has been relinked to this message.`);
}
