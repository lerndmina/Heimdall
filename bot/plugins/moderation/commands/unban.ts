/**
 * /unban <user> [reason] — Unban a member from the server.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Unban a member from the server")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("The user to unban").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the unban").setRequired(false));

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const guild = interaction.guild!;

  const result = await mod.modActionService.unban(guild, user.id, interaction.user.id, reason);

  if (result.success) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.success(`Unbanned **${user.tag}** — ${reason}`)],
    });
    broadcastDashboardChange(guild.id, "moderation", "mod_action", { requiredAction: "moderation.manage_infractions" });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to unban: ${result.error}`)],
    });
  }
}
