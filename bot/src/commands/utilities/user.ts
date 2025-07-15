import { CommandOptions, CommandProps } from "commandkit";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("user")
  .setDescription("Provides information about the user.")
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: true,
};

export async function run({ interaction, client, handler }: CommandProps) {
  const i = interaction as ChatInputCommandInteraction;
  await i.reply(`This command was run by ${i.user.displayName}`);
}
