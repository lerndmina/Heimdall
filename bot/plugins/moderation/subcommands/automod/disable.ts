/**
 * /automod disable — Turn off automod for this server.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { ModerationPluginAPI } from "../../index.js";

export async function handleDisable(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const mod = getPluginAPI<ModerationPluginAPI>("moderation");
  if (!mod) {
    await interaction.reply({ content: "Moderation plugin not loaded.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const config = await mod.moderationService.updateConfig(interaction.guildId!, { automodEnabled: false });

  if (config) {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.warning("Automod has been **disabled**.")],
    });
  } else {
    await interaction.editReply({
      embeds: [mod.lib.builders.HeimdallEmbedBuilder.error("Failed to disable automod.")],
    });
  }
}
