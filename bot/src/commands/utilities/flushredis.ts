import { SlashCommandBuilder } from "discord.js";
import { redisClient } from "../../Bot";
import { LegacyCommandData, LegacyCommandOptions, LegacySlashCommandProps } from "@heimdall/command-handler";

export const data = new SlashCommandBuilder().setName("flushredis").setDescription("Flushes redis!")
export const options: LegacyCommandOptions = {
  devOnly: true, //! MUST REMAIN DEV ONLY!!!
  deleted: false,
}

export function run ({ interaction, client, handler }: LegacySlashCommandProps) {
  redisClient.flushAll();
  interaction.reply({ content: "Flushed redis!", ephemeral: true });
}