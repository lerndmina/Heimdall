/**
 * /automod view — Display current automod configuration and rules summary.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";

export async function handleView(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");

  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const config = await mod.moderationService.getConfig(guildId);
  const allRules = await mod.moderationService.listRules(guildId);
  const enabledRules = allRules.filter((r) => r.enabled);

  const embed = mod.lib.createEmbedBuilder()
    .setTitle("🛡️ Automod Configuration")
    .addFields(
      { name: "Status", value: config?.automodEnabled ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Rules", value: `${enabledRules.length}/${allRules.length} active`, inline: true },
      { name: "Point Decay", value: config?.pointDecayEnabled ? `${config.pointDecayDays} days` : "Disabled", inline: true },
    );

  if (config?.escalationTiers && config.escalationTiers.length > 0) {
    const tierList = config.escalationTiers
      .sort((a, b) => a.pointsThreshold - b.pointsThreshold)
      .map((t) => `**${t.name}** — ${t.pointsThreshold} pts → ${t.action}${t.duration ? ` (${t.duration})` : ""}`)
      .join("\n");
    embed.addFields({ name: "Escalation Tiers", value: tierList });
  } else {
    embed.addFields({ name: "Escalation Tiers", value: "None configured" });
  }

  if (enabledRules.length > 0) {
    const ruleList = enabledRules
      .slice(0, 10)
      .map((r) => `• **${r.name}** — ${r.patterns.length} pattern(s), ${r.actions.join(", ")}${r.isPreset ? " 📦" : ""}`)
      .join("\n");
    embed.addFields({
      name: "Active Rules" + (enabledRules.length > 10 ? ` (showing 10/${enabledRules.length})` : ""),
      value: ruleList,
    });
  }

  if (config?.immuneRoles && config.immuneRoles.length > 0) {
    const roles = config.immuneRoles.map((id) => `<@&${id}>`).join(", ");
    embed.addFields({ name: "Immune Roles", value: roles });
  }

  await interaction.editReply({ embeds: [embed] });
}
