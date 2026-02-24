/**
 * /dev panel — Entry point that opens the unified developer panel.
 *
 * Assembles the DevPanelContext (with navigate closure), then renders
 * the main menu. All subsequent navigation is handled by panel callbacks.
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LibAPI } from "../../../lib/index.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { getDevServices } from "../../index.js";
import { PanelId, type DevPanelContext, type PanelBuilder } from "../devPanel.js";

// ── Panel builders ─────────────────────────────────────────────────────────
import { buildMainMenu } from "./mainMenu.js";
import { buildStatusPanel } from "./statusPanel.js";
import { buildActivityPanel } from "./activityPanel.js";
import { buildCachePanel } from "./cachePanel.js";
import { buildDatabasePanel } from "./databasePanel.js";
import { buildCommandsPanel } from "./commandsPanel.js";
import { buildDebugPanel } from "./debugPanel.js";

const panelBuilders: Record<string, PanelBuilder> = {
  [PanelId.MAIN]: buildMainMenu,
  [PanelId.STATUS]: buildStatusPanel,
  [PanelId.ACTIVITY]: buildActivityPanel,
  [PanelId.CACHE]: buildCachePanel,
  [PanelId.DATABASE]: buildDatabasePanel,
  [PanelId.COMMANDS]: buildCommandsPanel,
  [PanelId.DEBUG]: buildDebugPanel,
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleDevPanel(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;

  const lib = getPluginAPI<LibAPI>("lib");
  if (!lib) {
    await interaction.reply({ content: "❌ lib plugin not available.", ephemeral: true });
    return;
  }

  const { commandManager, redis, mongoose, wsManager } = getDevServices();

  await interaction.deferReply({ ephemeral: true });

  // Build the context with a navigate closure
  let ctx: DevPanelContext;

  const navigate = async (panelId: string) => {
    const builder = panelBuilders[panelId];
    if (!builder) return;
    const result = await builder(ctx);
    await interaction.editReply({ embeds: result.embeds, components: result.components });
  };

  ctx = {
    lib,
    client: client as unknown as HeimdallClient,
    originalInteraction: interaction,
    commandManager,
    redis,
    mongoose,
    wsManager,
    navigate,
  };

  // Open to the main menu
  await navigate(PanelId.MAIN);
}
