/**
 * Maintenance Panel — Restart or shut down the bot process.
 *
 * Restart uses process.exit(0) which signals Docker/PM2 to restart.
 * Shutdown uses process.exit(1) which signals an error/stop.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, requireConfirmation, PANEL_TTL, formatUptime, type DevPanelContext, type PanelResult } from "../devPanel.js";

export async function buildMaintenancePanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib } = ctx;

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🛠️ Maintenance")
    .setDescription(
      [
        "**Restart** — Exits with code `0`. Docker / PM2 will restart the process.",
        "**Shutdown** — Exits with code `1`. The process will stop completely.",
        "",
        `Current uptime: **${formatUptime(process.uptime())}**`,
        `PID: \`${process.pid}\``,
      ].join("\n"),
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const restartBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const confirmed = await requireConfirmation(i, "Restart Bot", "RESTART", "The bot process will exit with code 0. Your process manager should restart it automatically.");
      if (!confirmed) return;

      await ctx.originalInteraction.editReply({
        embeds: [lib.createEmbedBuilder().setTitle("🔄 Restarting…").setDescription("The bot is shutting down and will restart momentarily.")],
        components: [],
      });

      // Brief delay so the message sends before exit
      setTimeout(() => process.exit(0), 1000);
    }, PANEL_TTL)
    .setLabel("🔄 Restart")
    .setStyle(ButtonStyle.Primary);

  const shutdownBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const confirmed = await requireConfirmation(i, "Shutdown Bot", "SHUTDOWN", "The bot process will exit with code 1. It will NOT restart automatically.");
      if (!confirmed) return;

      await ctx.originalInteraction.editReply({
        embeds: [lib.createEmbedBuilder().setTitle("⛔ Shutting Down…").setDescription("The bot is shutting down. Goodbye!")],
        components: [],
      });

      setTimeout(() => process.exit(1), 1000);
    }, PANEL_TTL)
    .setLabel("⛔ Shutdown")
    .setStyle(ButtonStyle.Danger);

  await Promise.all([restartBtn.ready(), shutdownBtn.ready()]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, restartBtn, shutdownBtn)],
  };
}
