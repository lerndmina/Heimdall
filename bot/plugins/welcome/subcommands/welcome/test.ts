/**
 * /welcome test — Send a test welcome message using the current user as the "new member"
 */

import type { GuildMember } from "discord.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";

export async function handleTest(context: CommandContext, pluginAPI: WelcomePluginAPI): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const customMessage = interaction.options.getString("message");

  try {
    let channelId: string;
    let message: string;

    if (customMessage) {
      // Test a custom message in the configured channel (or current channel as fallback)
      const existingConfig = await pluginAPI.welcomeService.getConfig(guildId);
      channelId = existingConfig?.channelId ?? interaction.channelId;
      message = customMessage;
    } else {
      // Test the stored config
      const config = await pluginAPI.welcomeService.getConfig(guildId);
      if (!config) {
        await interaction.editReply("⚠️ No welcome message configured. Provide a message to test, or use `/welcome setup` first.");
        return;
      }
      channelId = config.channelId;
      message = config.message;
    }

    // Use the command invoker as the mock "new member"
    const member = interaction.member as GuildMember;

    const result = await pluginAPI.welcomeService.sendWelcomeMessage({ channelId, message }, member);

    if (result.success) {
      await interaction.editReply(`✅ Test welcome message sent to <#${channelId}>!`);
    } else {
      await interaction.editReply(`❌ Failed to send test message: ${result.error}`);
    }
  } catch (error) {
    await interaction.editReply("❌ Failed to send test message. Please try again.");
  }
}
