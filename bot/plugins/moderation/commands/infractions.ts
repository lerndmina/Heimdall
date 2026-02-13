/**
 * /infractions <user> [page] — View a user's infraction history.
 */

import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, type ButtonInteraction } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import type { ModerationPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("infractions")
  .setDescription("View a user's infraction history")
  .addUserOption((opt) => opt.setName("user").setDescription("The user to view infractions for").setRequired(true))
  .addIntegerOption((opt) => opt.setName("page").setDescription("Page number").setRequired(false).setMinValue(1));

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
  const page = interaction.options.getInteger("page") ?? 1;
  const guild = interaction.guild!;

  const activePoints = await mod.infractionService.getActivePoints(guild.id, user.id);
  const { infractions, total, pages } = await mod.infractionService.getUserInfractions(guild.id, user.id, { page, limit: 5 });

  const embed = mod.lib
    .createEmbedBuilder()
    .setTitle(`Infractions for ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ size: 64 }))
    .setColor(0x64748b)
    .setDescription(`**Active Points:** ${activePoints}\n**Total Infractions:** ${total}\n**Page:** ${page}/${pages || 1}`);

  if (infractions.length === 0) {
    embed.addFields({ name: "No Infractions", value: "This user has no recorded infractions." });
  } else {
    for (const inf of infractions) {
      const date = new Date(inf.createdAt).toLocaleDateString();
      const source = inf.source === "automod" ? "🤖 Automod" : "👤 Manual";
      const pointsStr = inf.pointsAssigned > 0 ? ` (+${inf.pointsAssigned} pts)` : "";
      const active = inf.active ? "" : " *(expired)*";

      embed.addFields({
        name: `${source} ${inf.type}${pointsStr}${active}`,
        value: [inf.reason ?? "No reason", inf.moderatorId ? `Moderator: <@${inf.moderatorId}>` : "", inf.ruleName ? `Rule: ${inf.ruleName}` : "", `Date: ${date}`].filter(Boolean).join("\n"),
      });
    }
  }

  // Build "Clear All" button
  const clearButton = mod.lib
    .createButtonBuilder(
      async (btnInteraction: ButtonInteraction) => {
        const cleared = await mod.infractionService.clearUserInfractions(guild.id, user.id);
        await btnInteraction.update({
          embeds: [mod.lib.builders.HeimdallEmbedBuilder.success(`Cleared ${cleared} active infractions for **${user.tag}**.`)],
          components: [],
        });
        broadcastDashboardChange(guild.id, "moderation", "infractions_cleared", { requiredAction: "moderation.manage_infractions" });
      },
      120_000, // 2 minute TTL
    )
    .setLabel("Clear All Infractions")
    .setStyle(4); // Danger

  await clearButton.ready();

  const row = new ActionRowBuilder<any>().addComponents(clearButton);

  await interaction.editReply({ embeds: [embed], components: total > 0 ? [row] : [] });
}
