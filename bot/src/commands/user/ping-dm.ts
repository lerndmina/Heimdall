/**
 * Example: DM-Only User Command
 *
 * This command can ONLY be used in private messages (DMs and private channels).
 * It will not appear in guild command lists.
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping-dm")
  .setDescription("Check bot latency (DM-only)")
  // User-installable only
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // ONLY allow in private contexts - not in guilds
  .setContexts([InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const start = Date.now();
  await interaction.deferReply();
  const latency = Date.now() - start;

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🏓 Pong!")
    .setDescription("Bot latency information (Private Message)")
    .addFields(
      { name: "API Latency", value: `${latency}ms`, inline: true },
      { name: "WebSocket", value: `${client.ws.ping}ms`, inline: true },
      { name: "Context", value: "Private DM", inline: true }
    )
    .setFooter({ text: "This command only works in DMs!" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
