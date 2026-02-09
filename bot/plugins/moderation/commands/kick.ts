/**
 * /kick <user> [reason] — Kick a member from the server.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("The member to kick").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the kick").setRequired(false));

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const guild = interaction.guild!;

  // Fetch member
  const member = await mod.lib.thingGetter.getMember(guild, user.id);
  if (!member) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("User is not in this server.")] });
    return;
  }

  // Hierarchy checks
  const botMember = guild.members.me!;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot kick this user — their role is higher than or equal to mine.")] });
    return;
  }

  const invoker = await mod.lib.thingGetter.getMember(guild, interaction.user.id);
  if (invoker && member.roles.highest.position >= invoker.roles.highest.position) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You cannot kick this user — their role is higher than or equal to yours.")] });
    return;
  }

  if (!member.kickable) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot kick this user.")] });
    return;
  }

  const result = await mod.modActionService.kick(guild, member, interaction.user.id, reason);

  if (result.success) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.success(`Kicked **${user.tag}** — ${reason}`)],
    });
    broadcastDashboardChange(guild.id, "moderation", "mod_action", { requiredAction: "moderation.manage_infractions" });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to kick: ${result.error}`)],
    });
  }
}
