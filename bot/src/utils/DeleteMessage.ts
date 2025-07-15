import { Message } from "discord.js";
import log from "./log";

const { DiscordAPIError } = require("discord.js");

export default async function (message: Message, time: number) {
  if (time == undefined) time = 0;
  setTimeout(async () => {
    try {
      await message.delete();
    } catch (error: unknown) {
      if (error instanceof DiscordAPIError) {
        const apiError = error as typeof DiscordAPIError;
        log.error(`Discord API Error: ${apiError.message}`);
      }
    }
  }, time);
}
