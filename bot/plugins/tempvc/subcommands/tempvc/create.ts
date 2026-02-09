/**
 * /tempvc create — Setup a channel as a join-to-create temp VC creator
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { TempVCPluginAPI } from "../../index.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createLogger } from "../../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";

const log = createLogger("tempvc:create");

export async function handleCreate(context: CommandContext): Promise<void> {
  const { interaction, client } = context;
  await interaction.deferReply({ ephemeral: true });

  const api = getPluginAPI(client);
  if (!api) {
    await interaction.editReply({ content: "❌ TempVC plugin is not loaded." });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  const category = interaction.options.getChannel("category", true);
  const useSequentialNames = interaction.options.getBoolean("sequential-names") ?? false;
  const channelName = interaction.options.getString("channel-name") ?? "Temp VC";

  if (useSequentialNames && channelName.trim().length === 0) {
    await interaction.editReply({ content: "❌ If using sequential names, you must provide a channel name." });
    return;
  }

  try {
    await api.tempVCService.addChannel(interaction.guild!.id, {
      channelId: channel.id,
      categoryId: category.id,
      useSequentialNames,
      channelName: channelName.trim(),
    });

    const lib = client.plugins?.get("lib") as any;
    const embed = lib?.createEmbedBuilder
      ? lib
          .createEmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Temp VC Creator Setup Complete!")
          .setDescription(`Users who join <#${channel.id}> will now automatically get their own temporary voice channel!`)
          .addFields(
            { name: "📍 Creator Channel", value: `<#${channel.id}>`, inline: true },
            { name: "📁 Category", value: `<#${category.id}>`, inline: true },
            {
              name: "🏷️ Naming Style",
              value: useSequentialNames ? `Sequential: "${channelName} #1", "#2", etc.` : `User-based: "Username's VC"`,
              inline: false,
            },
          )
          .setFooter({ text: "Channels will auto-delete when empty" })
      : null;

    if (embed) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: `✅ Creator channel <#${channel.id}> configured.` });
    }

    broadcastDashboardChange(interaction.guild!.id, "tempvc", "config_updated", { requiredAction: "tempvc.manage_config" });
    log.info(`User ${interaction.user.tag} setup creator channel ${channel.id} in guild ${interaction.guild!.id}`);
  } catch (error: any) {
    if (error.message?.includes("already configured")) {
      await interaction.editReply({ content: "❌ This channel is already configured as a temp VC creator." });
    } else {
      log.error("Error adding channel:", error);
      await interaction.editReply({ content: "❌ Failed to setup temp VC creator. Please try again." });
    }
  }
}
