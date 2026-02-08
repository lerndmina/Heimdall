/**
 * /automod enable — Turn on automod for this server.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";

export async function handleEnable(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const config = await mod.moderationService.updateConfig(interaction.guildId!, { automodEnabled: true });

  if (config) {
    const rules = await mod.moderationService.getEnabledRules(interaction.guildId!);
    await interaction.editReply({
      embeds: [
        mod.lib.builders.HeimdallEmbedBuilder.success(
          `Automod has been **enabled**.${rules.length === 0 ? "\n\n⚠️ No rules are configured yet. Use the dashboard to add rules." : `\n\n${rules.length} rule(s) active.`}`,
        ),
      ],
    });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Failed to enable automod.")],
    });
  }
}
