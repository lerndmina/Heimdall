/**
 * Example User Command - Hello Command
 *
 * This demonstrates a proper user-installable command that:
 * 1. Uses ApplicationIntegrationType.UserInstall (REQUIRED for commands in commands/user/)
 * 2. Can optionally add GuildInstall for hybrid behavior
 * 3. Specifies contexts where the command can be used
 * 4. Works in guilds, DMs, and private channels
 *
 * User commands in commands/user/ MUST work as user commands first and foremost!
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown } from "../../Bot";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("testcmd")
  .setDescription("A friendly greeting command that works everywhere!")
  // REQUIRED: User commands must include UserInstall
  .setIntegrationTypes([
    ApplicationIntegrationType.UserInstall,
    // Optional: Add GuildInstall for hybrid behavior
    // ApplicationIntegrationType.GuildInstall
  ])
  // Specify where this command can be used
  .setContexts([
    InteractionContextType.Guild, // Can use in servers
    InteractionContextType.BotDM, // Can use in bot DMs
    InteractionContextType.PrivateChannel, // Can use in private channels
  ]);

export const options: LegacyCommandOptions = {
  devOnly: false, // Set to true to restrict to owner IDs
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  await initialReply(interaction, true);
  setCommandCooldown(globalCooldownKey(interaction.commandName), 15);

  // Detect context
  const inGuild = !!interaction.guild;
  const contextName = inGuild ? `the server **${interaction.guild!.name}**` : "a private message";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("👋 Hello!")
    .setDescription(`Hello ${interaction.user}! You used this command in ${contextName}.`)
    .addFields(
      {
        name: "User Command",
        value: "This command was installed on your user profile!",
        inline: true,
      },
      { name: "Context", value: inGuild ? "Guild" : "Private", inline: true }
    )
    .setFooter({
      text: `Requested by ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
