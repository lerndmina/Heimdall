/**
 * /tempvc delete-all — Remove all creator channels for this server
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";

const log = createLogger("tempvc:delete-all");

export async function handleDeleteAll(context: CommandContext): Promise<void> {
  const { interaction, client } = context;
  await interaction.deferReply({ ephemeral: true });

  const api = getPluginAPI(client);
  if (!api) {
    await interaction.editReply({ content: "❌ TempVC plugin is not loaded." });
    return;
  }

  const config = await api.tempVCService.getGuildConfig(interaction.guild!.id);
  if (!config || config.channels.length === 0) {
    await interaction.editReply({ content: "❌ No temp VC creators are configured in this server." });
    return;
  }

  const channelCount = config.channels.length;
  const channelList = config.channels.map((c: any) => `<#${c.channelId}>`).join(", ");

  try {
    await api.tempVCService.removeAllChannels(interaction.guild!.id);

    const lib = client.plugins?.get("lib") as any;
    const embed = lib?.createEmbedBuilder
      ? lib
          .createEmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🗑️ All Temp VC Creators Removed")
          .setDescription(`Removed **${channelCount}** temp VC creator channel${channelCount === 1 ? "" : "s"}.`)
          .addFields({ name: "Removed Channels", value: channelList, inline: false })
          .setFooter({ text: "Existing temp channels will remain until empty" })
      : null;

    if (embed) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: `✅ Removed ${channelCount} creator channel(s).` });
    }

    broadcastDashboardChange(interaction.guild!.id, "tempvc", "config_updated", { requiredAction: "tempvc.manage_config" });
    log.info(`User ${interaction.user.tag} removed ALL ${channelCount} creator channels in guild ${interaction.guild!.id}`);
  } catch (error) {
    log.error("Error removing channels:", error);
    await interaction.editReply({ content: "❌ Failed to remove temp VC creators. Please try again." });
  }
}
