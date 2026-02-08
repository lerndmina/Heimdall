/**
 * /minecraft-status — View and manage your Minecraft account linking status
 *
 * Shows the unified account manager panel with interactive buttons
 * for linking, unlinking, and viewing account status.
 * Alias for /link-minecraft (both show the same panel).
 */

import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import { showAccountPanel } from "../utils/accountPanel.js";

export const data = new SlashCommandBuilder().setName("minecraft-status").setDescription("View and manage your Minecraft account linking status");

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  await showAccountPanel(interaction, pluginAPI.lib);
}
