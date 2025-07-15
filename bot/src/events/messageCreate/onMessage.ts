import {
  MessageType,
  MessageFlags,
  ActivityType,
  Message,
  Client,
  ChannelType,
  ThreadChannel,
} from "discord.js";
import syncCommands from "../../utils/unregister-commands";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import { debugMsg, isVoiceMessage } from "../../utils/TinyUtils";
import log from "../../utils/log";

const env = FetchEnvs();

const BANNED_GUILDS = ["856937743543304203"];

/**
 *
 * @param {Message} message
 * @param {Client} client
 * @returns
 */
export default async function (message: Message, client: Client<true>) {
  if (message.author.bot) return;
  if (message.channel.type == ChannelType.DM) return;
  // We don't return true here because we want to continue to the next event

  // Send reactions for transcriptions
  if (isVoiceMessage(message) && !(message.channel! instanceof ThreadChannel)) {
    if (message.reactions.cache.size > 0) return;
    message.react("✍️").then(() => message.react("❌"));
    return true; // Stop the event loop we've delt with this message
  }

  // Make message of type Message<true>
  message = message as Message<true>;
  if (message.guildId && BANNED_GUILDS.includes(message.guildId)) return;

  if (message.content.startsWith(`${env.PREFIX}embedtest`)) {
    if (!env.OWNER_IDS.includes(message.author.id)) return;

    message.reply({
      embeds: [
        BasicEmbed(
          client,
          "Title",
          "Description",
          [
            {
              name: "Fields",
              value: '```js\n[{ name: "Hello", value: "World", inline: true }]```',
              inline: true,
            },
          ],
          "Random"
        ),
      ],
    });
  }

  // Unync commmand
  if (message.content.startsWith(`${env.PREFIX}unsync`)) {
    if (!env.OWNER_IDS.includes(message.author.id)) return;
    const args = message.content.split(" ");
    if (args.length == 2 && args[1] == "global") {
      syncCommands(client, message, undefined, true);
      return true;
    } else if (!isNaN(Number(args[1]))) {
      const commandId = args[1];
      syncCommands(client, message, undefined, false, commandId);
    } else if (message.guildId) {
      syncCommands(client, message, message.guildId, false);
      return true;
    }
  }

  // Reboot command
  if (message.content.startsWith(`${env.PREFIX}reboot`)) {
    if (!env.OWNER_IDS.includes(message.author.id))
      return message.reply(
        "I'm sorry dave, I'm afraid I can't do that. <:pikagun:1168644356828303383>"
      );
    if (message.content == `${env.PREFIX}reboot hard`) {
      await message.reply({
        content: "https://tenor.com/view/tissue-roll-hangging-suicide-funny-gif-22276377",
      });
      process.exit(0);
    }

    await message.reply({
      content: "https://tenor.com/view/bye-bourne-gif-22698046",
    });
    log.info("Rebooting..."); // Set offline
    client.user.setActivity("my own death.", { type: ActivityType.Watching });
    client.user.setStatus("dnd");

    // Cleanly log out of Discord
    await client.destroy();

    // Log out of MongoDB
    const mongoose = require("mongoose");
    await mongoose.disconnect(); // Log out of Redis
    const { redisClient } = require("../../Bot");
    await redisClient.disconnect();

    // Kill the webserver
    const { stopHealthServer } = require("../../Health");
    await stopHealthServer();

    // Log back in
    const { Start } = require("../../Bot");

    await Start();
  }
}
