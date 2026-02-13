/**
 * /setpoints <user> <points> [reason] — Set a user's infraction points to a specific value.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("setpoints")
  .setDescription("Set a user's infraction points to a specific value")
  .addUserOption((opt) => opt.setName("user").setDescription("The user whose points to set").setRequired(true))
  .addIntegerOption((opt) => opt.setName("points").setDescription("The point value to set").setRequired(true).setMinValue(0).setMaxValue(1000))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason for setting points").setRequired(false));

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
  const points = interaction.options.getInteger("points", true);
  const reason = interaction.options.getString("reason") ?? undefined;
  const guild = interaction.guild!;

  // Don't modify bot points
  if (user.bot) {
    await interaction.editReply({ embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("You cannot set points for bots.")] });
    return;
  }

  try {
    const result = await mod.infractionService.setPoints(guild.id, user.id, points, interaction.user.id, reason);

    const embed = mod.lib
      .createEmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("📊 Points Updated")
      .addFields(
        { name: "User", value: `${user.tag} (${user})`, inline: true },
        { name: "Previous Points", value: `${result.previousPoints}`, inline: true },
        { name: "New Points", value: `${result.newPoints}`, inline: true },
      );

    if (reason) {
      embed.addFields({ name: "Reason", value: reason });
    }

    await interaction.editReply({ embeds: [embed] });
    broadcastDashboardChange(guild.id, "moderation", "points_updated", { requiredAction: "moderation.manage_infractions" });

    // Log the action
    await mod.modActionService.sendModLog(
      guild,
      "mod_actions",
      mod.lib
        .createEmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle("📊 Points Set")
        .setThumbnail(user.displayAvatarURL({ size: 64 }))
        .addFields(
          { name: "User", value: `${user.tag} (${user})`, inline: true },
          { name: "Moderator", value: `${interaction.user}`, inline: true },
          { name: "Points", value: `${result.previousPoints} → ${result.newPoints}`, inline: true },
          { name: "Reason", value: reason ?? "No reason provided" },
        )
        .setFooter({ text: `User ID: ${user.id}` }),
    );

    // Check escalation if points increased
    if (result.newPoints > result.previousPoints) {
      const config = await mod.moderationService.getConfig(guild.id);
      if (config) {
        const member = await mod.lib.thingGetter.getMember(guild, user.id);
        if (member) {
          await mod.escalationService.checkAndEscalate(guild, member, result.newPoints, config as any);
        }
      }
    }
  } catch (error) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error(`Failed to set points: ${(error as Error).message}`)],
    });
  }
}
