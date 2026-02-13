/**
 * /ban <user> [reason] [delete_days] — Ban a member from the server.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a member from the server")
  .addUserOption((opt) => opt.setName("user").setDescription("The member to ban").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the ban").setRequired(false))
  .addIntegerOption((opt) => opt.setName("delete_days").setDescription("Days of messages to delete (0-7)").setRequired(false).setMinValue(0).setMaxValue(7));

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
  const deleteDays = interaction.options.getInteger("delete_days") ?? 0;
  const guild = interaction.guild!;

  // Hierarchy checks (if member is in guild)
  const member = await mod.lib.thingGetter.getMember(guild, user.id);
  if (member) {
    const botMember = guild.members.me!;
    if (member.roles.highest.position >= botMember.roles.highest.position) {
      await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot ban this user — their role is higher than or equal to mine.")] });
      return;
    }

    const invoker = await mod.lib.thingGetter.getMember(guild, interaction.user.id);
    if (invoker && member.roles.highest.position >= invoker.roles.highest.position) {
      await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You cannot ban this user — their role is higher than or equal to yours.")] });
      return;
    }

    if (!member.bannable) {
      await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot ban this user.")] });
      return;
    }
  }

  const result = await mod.modActionService.ban(guild, user.id, interaction.user.id, reason, deleteDays);

  if (result.success) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.success(`Banned **${user.tag}** — ${reason}`)],
    });
    broadcastDashboardChange(guild.id, "moderation", "mod_action", { requiredAction: "moderation.manage_infractions" });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to ban: ${result.error}`)],
    });
  }
}
