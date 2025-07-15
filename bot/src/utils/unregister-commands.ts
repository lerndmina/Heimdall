import { Client, Message, REST, Routes, Snowflake } from "discord.js";
import fs from "fs";
import path from "path";
import DeleteMessage from "./DeleteMessage";
import BasicEmbed from "./BasicEmbed";
import FetchEnvs from "./FetchEnvs";
import { assert } from "console";
import log from "./log";

const env = FetchEnvs();

export default async function (
  client: Client<true>,
  message: Message,
  guildId: Snowflake | undefined,
  global: boolean,
  id?: Snowflake
) {
  // Construct and prepare an instance of the REST module
  const rest = new REST().setToken(env.BOT_TOKEN);

  if (global == false && guildId != undefined && !id) {
    try {
      await message.channel.send("Deleting this guild's commands...");
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [] });
      await message.channel.send("Guild's commands deleted.");
      return;
    } catch (error) {
      log.error(error as string);
      await message.channel.send("Error deleting commands.");
      return;
    }
  } else if (global == true) {
    try {
      await message.channel.send("Deleting global commands...");
      await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
      await message.channel.send("Global commands deleted.");
      return;
    } catch (error) {
      log.error(error as string);
      await message.channel.send("Error deleting commands.");
      return;
    }
  } else if (id) {
    try {
      await message.channel.send("Deleting this command...");
      await rest.delete(Routes.applicationCommand(client.user.id, id));
      await message.channel.send("Command deleted.");
      return;
    } catch (error) {
      log.error(error as string);
      await message.channel.send("Error deleting command.");
      return;
    }
  }
}
