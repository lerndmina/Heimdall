/**
 * /tempvc delete — Remove a creator channel from the configuration
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";

const log = createLogger("tempvc:delete");

export async function handleDelete(context: CommandContext): Promise<void> {
  const { interaction, client } = context;
  await interaction.deferReply({ ephemeral: true });

  const api = getPluginAPI(client);
  if (!api) {
    await interaction.editReply({ content: "❌ TempVC plugin is not loaded." });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);

  const config = await api.tempVCService.getGuildConfig(interaction.guild!.id);
  if (!config) {
    await interaction.editReply({ content: "❌ No temp VC creators are configured in this server." });
    return;
  }

  const channelConfig = config.channels.find((c: any) => c.channelId === channel.id);
  if (!channelConfig) {
    await interaction.editReply({ content: `❌ The channel <#${channel.id}> is not configured as a temp VC creator.` });
    return;
  }

  try {
    await api.tempVCService.removeChannel(interaction.guild!.id, channel.id);

    const lib = client.plugins?.get("lib") as any;
    const embed = lib?.createEmbedBuilder
      ? lib
          .createEmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🗑️ Temp VC Creator Removed")
          .setDescription(`The channel <#${channel.id}> will no longer create temporary voice channels.`)
          .setFooter({ text: "Existing temp channels will remain until empty" })
      : null;

    if (embed) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: `✅ Creator channel <#${channel.id}> removed.` });
    }

    broadcastDashboardChange(interaction.guild!.id, "tempvc", "config_updated", { requiredAction: "tempvc.manage_config" });
    log.info(`User ${interaction.user.tag} removed creator channel ${channel.id} in guild ${interaction.guild!.id}`);
  } catch (error) {
    log.error("Error removing channel:", error);
    await interaction.editReply({ content: "❌ Failed to remove temp VC creator. Please try again." });
  }
}
