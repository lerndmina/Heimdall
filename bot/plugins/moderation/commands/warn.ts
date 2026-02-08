/**
 * /warn <user> [points] [reason] — Warn a member with points.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member and assign infraction points")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("The member to warn").setRequired(true))
  .addIntegerOption((opt) =>
    opt.setName("points").setDescription("Points to assign (default: 1)").setRequired(false).setMinValue(1).setMaxValue(100),
  )
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for the warning").setRequired(false));

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");

  await interaction.deferReply({ ephemeral: true });

  const user = interaction.options.getUser("user", true);
  const points = interaction.options.getInteger("points") ?? 1;
  const reason = interaction.options.getString("reason") ?? "No reason provided";
  const guild = interaction.guild!;

  // Fetch member
  const member = await mod.lib.thingGetter.getMember(guild, user.id);
  if (!member) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("User is not in this server.")] });
    return;
  }

  // Don't warn bots
  if (member.user.bot) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You cannot warn bots.")] });
    return;
  }

  const result = await mod.modActionService.warn(guild, member, interaction.user.id, points, reason);

  if (result.success) {
    const embed = mod.lib.createEmbedBuilder()
      .setColor(0xeab308)
      .setTitle("⚠️ Warning Issued")
      .addFields(
        { name: "User", value: `${user.tag} (${user})`, inline: true },
        { name: "Points", value: `+${points} (Total: ${result.activePoints})`, inline: true },
        { name: "Reason", value: reason },
      );

    if (result.escalation?.triggered) {
      embed.addFields({
        name: "⚡ Escalation Triggered",
        value: `**${result.escalation.tierName}** — ${result.escalation.action}`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to warn: ${result.error}`)],
    });
  }
}
