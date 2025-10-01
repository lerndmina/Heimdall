/**
 * Help command - Display all available Helpie commands
 * Will be available as: /helpie help
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder().setName("help").setDescription("Get help with Helpie commands");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📚 Helpie Commands")
    .setDescription("Helpie is a user-installable AI support assistant. All commands are used with `/helpie <command>`")
    .addFields(
      {
        name: "/helpie ping",
        value: "Check bot latency and connection status",
        inline: false,
      },
      {
        name: "/helpie help",
        value: "Display this help message",
        inline: false,
      },
      {
        name: "/helpie ask <message>",
        value: "Ask Helpie AI a question",
        inline: false,
      }
    )
    .setFooter({ text: "Helpie - AI Support Assistant" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
