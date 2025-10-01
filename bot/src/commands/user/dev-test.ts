/**
 * Example: Dev-Only User Command
 *
 * This command is available globally but only executable by owner IDs.
 * The command handler will check owner IDs at execution time, not registration.
 * This allows owners to use dev commands from their user profile anywhere.
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("dev-test")
  .setDescription("Developer testing command (owner only)")
  // User-installable for developers
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // Allow in all contexts for maximum flexibility
  .setContexts([
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ]);

export const options: LegacyCommandOptions = {
  devOnly: true, // Only owner IDs can execute
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const inGuild = !!interaction.guild;
  const guildCount = client.guilds.cache.size;
  const userCount = client.users.cache.size;
  const commandCount = handler.getCommands().size;

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🔧 Developer Test Command")
    .setDescription("This command is restricted to bot owners.")
    .addFields(
      {
        name: "Context",
        value: inGuild ? `Guild: ${interaction.guild!.name}` : "Private DM",
        inline: false,
      },
      { name: "Guilds", value: guildCount.toString(), inline: true },
      { name: "Cached Users", value: userCount.toString(), inline: true },
      { name: "Commands Loaded", value: commandCount.toString(), inline: true },
      { name: "Node Version", value: process.version, inline: true },
      { name: "Uptime", value: `${Math.floor(process.uptime())}s`, inline: true }
    )
    .setFooter({ text: `Executor: ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
