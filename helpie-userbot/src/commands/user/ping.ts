/**
 * Ping command - User-installable command that works everywhere
 *
 * This command can be installed on user profiles and works in:
 * - Guilds (servers)
 * - DMs with the bot
 * - Private channels
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check bot latency and status")
  // User-installable - this bot is designed for users, not guilds
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // Allow in all contexts
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  const start = Date.now();
  await interaction.deferReply({ ephemeral: true });
  const latency = Date.now() - start;

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🏓 Pong!")
    .setDescription("Helpie Userbot is online and responsive")
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
