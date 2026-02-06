import { SlashCommandBuilder, PermissionsBitField, type GuildMember } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { LibAPI } from "../../lib/index.js";

/**
 * Key permissions to display for a guild member.
 */
const KEY_PERMISSIONS = [
  { perm: PermissionsBitField.Flags.Administrator, name: "Administrator" },
  { perm: PermissionsBitField.Flags.ManageGuild, name: "Manage Server" },
  { perm: PermissionsBitField.Flags.ManageRoles, name: "Manage Roles" },
  { perm: PermissionsBitField.Flags.ManageChannels, name: "Manage Channels" },
  { perm: PermissionsBitField.Flags.KickMembers, name: "Kick Members" },
  { perm: PermissionsBitField.Flags.BanMembers, name: "Ban Members" },
  { perm: PermissionsBitField.Flags.ManageMessages, name: "Manage Messages" },
  { perm: PermissionsBitField.Flags.MentionEveryone, name: "Mention @everyone" },
  { perm: PermissionsBitField.Flags.ModerateMembers, name: "Timeout Members" },
] as const;

/**
 * Returns the list of key permission names a member has.
 */
function getKeyPermissions(member: GuildMember): string[] {
  const result: string[] = [];
  for (const { perm, name } of KEY_PERMISSIONS) {
    if (member.permissions.has(perm)) {
      result.push(name);
    }
  }
  return result;
}

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Get information about a user")
  .addUserOption((option) => option.setName("user").setDescription("The user to get information about (defaults to yourself)").setRequired(false));

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;
  const lib = getPluginAPI<LibAPI>("lib");

  await interaction.deferReply();

  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const guild = interaction.guild!;

    // Use ThingGetter for reliable member fetch
    const member = lib ? await lib.thingGetter.getMember(guild, targetUser.id) : (guild.members.cache.get(targetUser.id) ?? null);

    // Build embed
    const embed = lib ? lib.createEmbedBuilder() : null;

    if (!embed) {
      // Minimal fallback without lib
      await interaction.editReply({ content: `**${targetUser.displayName}** (${targetUser.username}) — ID: ${targetUser.id}` });
      return;
    }

    // --- Header ---
    let description = "";
    if (targetUser.bot) description += "🤖 **This user is a bot**\n";

    embed
      .setColor(member?.displayHexColor || 0x5865f2)
      .setAuthor({
        name: `${targetUser.displayName} (${targetUser.username})`,
        iconURL: targetUser.displayAvatarURL({ size: 256 }),
      })
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .setDescription(description || null)
      .addFields(
        { name: "📝 User ID", value: `\`${targetUser.id}\``, inline: true },
        {
          name: "📅 Account Created",
          value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>\n<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    // --- Guild-specific info ---
    if (member) {
      // Join date & position
      if (member.joinedAt) {
        const joinTs = Math.floor(member.joinedAt.getTime() / 1000);
        embed.addFields({
          name: "📥 Joined Server",
          value: `<t:${joinTs}:D>\n<t:${joinTs}:R>`,
          inline: true,
        });

        const members = await guild.members.fetch();
        const sorted = members.sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
        const joinPosition = Array.from(sorted.values()).findIndex((m) => m.id === member.id) + 1;

        if (joinPosition > 0) {
          embed.addFields({
            name: "📊 Join Position",
            value: `#${joinPosition} / ${members.size}`,
            inline: true,
          });
        }
      }

      // Nickname
      if (member.nickname) {
        embed.addFields({ name: "✏️ Nickname", value: member.nickname, inline: true });
      }

      // Boost status
      if (member.premiumSince) {
        embed.addFields({
          name: "💎 Boosting Since",
          value: `<t:${Math.floor(member.premiumSince.getTime() / 1000)}:R>`,
          inline: true,
        });
      }

      // Timeout status
      if (member.communicationDisabledUntil && member.communicationDisabledUntil > new Date()) {
        embed.addFields({
          name: "⏱️ Timed Out Until",
          value: `<t:${Math.floor(member.communicationDisabledUntil.getTime() / 1000)}:F>`,
          inline: false,
        });
      }

      // Roles (exclude @everyone, cap at 20)
      const roles = member.roles.cache
        .filter((role) => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => role.toString());

      if (roles.length > 0) {
        const displayed = roles.slice(0, 20);
        const remaining = roles.length - 20;
        embed.addFields({
          name: `🎭 Roles [${roles.length}]`,
          value: displayed.join(", ") + (remaining > 0 ? `\n*+${remaining} more...*` : ""),
          inline: false,
        });

        // Highest role
        const highest = member.roles.highest;
        if (highest.id !== guild.id) {
          embed.addFields({ name: "⭐ Highest Role", value: highest.toString(), inline: true });
        }
      }

      // Key permissions
      const permissions = getKeyPermissions(member);
      if (permissions.length > 0) {
        embed.addFields({
          name: "🔑 Key Permissions",
          value: permissions.map((p) => `• ${p}`).join("\n"),
          inline: false,
        });
      }

      // Voice state
      if (member.voice.channel) {
        const voiceInfo: string[] = [];
        voiceInfo.push(`📢 ${member.voice.channel.toString()}`);
        if (member.voice.serverMute) voiceInfo.push("🔇 Server Muted");
        if (member.voice.serverDeaf) voiceInfo.push("🔇 Server Deafened");
        if (member.voice.selfMute) voiceInfo.push("🔇 Self Muted");
        if (member.voice.selfDeaf) voiceInfo.push("🔇 Self Deafened");
        if (member.voice.streaming) voiceInfo.push("📹 Streaming");
        if (member.voice.selfVideo) voiceInfo.push("📹 Video");

        embed.addFields({ name: "🎤 Voice State", value: voiceInfo.join("\n"), inline: false });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({ content: "❌ An error occurred while fetching user information." });
  }
}
