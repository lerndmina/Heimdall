/**
 * Help command - Shows available commands
 * User-installable command
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("View all available Helpie commands")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction }: LegacySlashCommandProps) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📚 Helpie Commands")
    .setDescription("Helpie is a user-installable bot for managing support tickets and AI assistance.")
    .addFields(
      {
        name: "🏓 /ping",
        value: "Check bot latency and status",
        inline: false,
      },
      {
        name: "❓ /help",
        value: "Show this help message",
        inline: false,
      },
      {
        name: "\u200B",
        value: "More commands coming soon!",
        inline: false,
      }
    )
    .setFooter({ text: "Helpie - User-installable support bot" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
