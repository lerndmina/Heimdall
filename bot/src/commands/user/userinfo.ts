/**
 * Example: Guild-Context User Command
 *
 * This user command ONLY works in guilds (servers).
 * By setting contexts to [InteractionContextType.Guild], the command handler
 * will automatically validate that the interaction is in a guild context.
 */
import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Get information about a user in this server")
  .addUserOption((option) =>
    option.setName("user").setDescription("The user to get info about").setRequired(false)
  )
  // User-installable
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // ONLY allow in guild context - handler will validate guild exists
  .setContexts([InteractionContextType.Guild]);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  // Safe to assume interaction.guild exists due to context restriction
  const targetUser = interaction.options.getUser("user") || interaction.user;
  const member = await interaction.guild!.members.fetch(targetUser.id);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`User Info: ${targetUser.tag}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "User ID", value: targetUser.id, inline: true },
      {
        name: "Account Created",
        value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: "Joined Server",
        value: member.joinedAt
          ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
          : "Unknown",
        inline: true,
      },
      {
        name: "Roles",
        value: member.roles.cache.size > 1 ? `${member.roles.cache.size - 1} roles` : "No roles",
        inline: true,
      },
      { name: "Nickname", value: member.nickname || "None", inline: true }
    )
    .setFooter({ text: `Server: ${interaction.guild!.name}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
