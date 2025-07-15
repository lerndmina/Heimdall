import { SlashCommandBuilder } from "discord.js";
import { redisClient } from "../../Bot";
import { CommandData, CommandOptions, SlashCommandProps } from "commandkit";

export const data = new SlashCommandBuilder().setName("flushredis").setDescription("Flushes redis!")
export const options: CommandOptions = {
  devOnly: true, //! MUST REMAIN DEV ONLY!!!
  deleted: false,
}

export function run ({ interaction, client, handler }: SlashCommandProps) {
  redisClient.flushAll();
  interaction.reply({ content: "Flushed redis!", ephemeral: true });
}