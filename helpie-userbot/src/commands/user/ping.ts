/**
 * Ping command - Check bot latency and status
 * Will be available as: /helpie ping
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder().setName("ping").setDescription("Check bot latency and status");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  const start = Date.now();
  await interaction.deferReply();
  const latency = Date.now() - start;

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🏓 Pong!")
    .setDescription("Helpie is online and responsive")
    .addFields(
      { name: "API Latency", value: `${latency}ms`, inline: true },
      { name: "WebSocket", value: `${client.ws.ping}ms`, inline: true },
      {
        name: "Context",
        value: interaction.guild ? "Guild" : "Private DM",
        inline: true,
      }
    )
    .setFooter({ text: "Helpie - User-installable support bot" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
