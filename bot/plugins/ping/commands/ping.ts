import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { LibAPI } from "../../lib/index.js";

export const data = new SlashCommandBuilder().setName("ping").setDescription("Check the bot latency");

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;

  const lib = getPluginAPI<LibAPI>("lib");

  const sent = await interaction.reply({
    content: "🏓 Pinging...",
    fetchReply: true,
  });

  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const wsLatency = client.ws.ping;

  // Use lib's embed builder if available
  if (lib) {
    const embed = lib
      .createEmbedBuilder()
      .setTitle("🏓 Pong!")
      .addFields({ name: "Roundtrip Latency", value: `${latency}ms`, inline: true }, { name: "WebSocket Latency", value: `${wsLatency}ms`, inline: true });

    await interaction.editReply({ content: "", embeds: [embed] });
  } else {
    await interaction.editReply({
      content: `🏓 Pong! Latency: ${latency}ms | WS: ${wsLatency}ms`,
    });
  }
}
