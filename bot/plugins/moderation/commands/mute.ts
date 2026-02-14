/**
 * /mute <user> <duration> [reason] — Mute a member.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";
import { formatDuration } from "../utils/dm-templates.js";

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Mute a member for a specified duration")
  .addUserOption((opt) => opt.setName("user").setDescription("The member to mute").setRequired(true))
  .addStringOption((opt) => opt.setName("duration").setDescription("Duration (e.g. 1h, 30m, 2d)").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the timeout").setRequired(false));

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
  const durationStr = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const guild = interaction.guild!;
  const config = await mod.moderationService.getConfig(guild.id);
  const muteMode = config?.muteMode === "role" ? "role" : "native";

  // Parse duration
  const durationMs = mod.lib.parseDuration(durationStr);
  if (!durationMs) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Invalid duration format. Use formats like: `1h`, `30m`, `2d`, `1w`")],
    });
    return;
  }

  // Fetch member
  const member = await mod.lib.thingGetter.getMember(guild, user.id);
  if (!member) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("User is not in this server.")] });
    return;
  }

  // Hierarchy checks
  const botMember = guild.members.me!;
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot timeout this user — their role is higher than or equal to mine.")] });
    return;
  }

  const invoker = await mod.lib.thingGetter.getMember(guild, interaction.user.id);
  if (invoker && member.roles.highest.position >= invoker.roles.highest.position) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You cannot timeout this user — their role is higher than or equal to yours.")] });
    return;
  }

  if (muteMode === "native" && !member.moderatable) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("I cannot timeout this user.")] });
    return;
  }

  const result = await mod.modActionService.mute(guild, member, interaction.user.id, durationMs, reason);

  if (result.success) {
    const successMessage = result.mode === "role" ? `Muted **${user.tag}** with the configured mute role — ${reason}` : `Timed out **${user.tag}** for **${formatDuration(durationMs)}** — ${reason}`;

    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.success(successMessage)] });
    broadcastDashboardChange(guild.id, "moderation", "mod_action", { requiredAction: "moderation.manage_infractions" });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to timeout: ${result.error}`)],
    });
  }
}
