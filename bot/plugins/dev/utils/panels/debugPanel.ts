/**
 * Debug Panel — Log level toggle, Sentry test, and process diagnostics.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, formatBytes, formatUptime, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { createLogger, LogLevel, type LoggerFunction } from "../../../../src/core/Logger.js";
import { captureException } from "../../../../src/utils/sentry.js";
import { envLoader } from "../../../../src/utils/env.js";
import type { GlobalEnv } from "../../../../src/types/Env.js";

/** Root logger used to toggle global debug logging on/off. */
const rootLog: LoggerFunction = createLogger("dev:debug-panel");

export async function buildDebugPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib } = ctx;

  // ── Gather debug info ────────────────────────────────────────────────────
  const logConfig = rootLog.getConfig();
  const isDebug = logConfig.minLevel === LogLevel.DEBUG;
  const sentryDsn = process.env.SENTRY_DSN;
  const sentryEnabled = !!sentryDsn && sentryDsn.length > 0;
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  // ── Environment variable status ──────────────────────────────────────────
  const globalEnv = envLoader.getGlobalEnv();
  const sensitiveKeys = new Set<keyof GlobalEnv>(["BOT_TOKEN", "MONGODB_URI", "REDIS_URL", "ENCRYPTION_KEY", "INTERNAL_API_KEY", "SENTRY_DSN"]);
  const envLines: string[] = [];
  for (const [key, value] of Object.entries(globalEnv) as [keyof GlobalEnv, unknown][]) {
    const isSet = value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);
    const icon = isSet ? "✅" : "❌";
    const display = sensitiveKeys.has(key) ? (isSet ? "••••••" : "—") : String(value);
    envLines.push(`${icon} \`${key}\`: ${display}`);
  }

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🪲 Debug Tools")
    .addFields(
      { name: "Log Level", value: isDebug ? "🟡 DEBUG" : "🟢 INFO", inline: true },
      { name: "Sentry", value: sentryEnabled ? "✅ Configured" : "❌ No DSN", inline: true },
      { name: "Node.js", value: process.version, inline: true },
      { name: "PID", value: String(process.pid), inline: true },
      { name: "Platform", value: `${process.platform} ${process.arch}`, inline: true },
      { name: "Process Uptime", value: formatUptime(process.uptime()), inline: true },
      { name: "Heap", value: `${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`, inline: true },
      { name: "RSS", value: formatBytes(mem.rss), inline: true },
      { name: "CPU (user/sys)", value: `${Math.round(cpuUsage.user / 1000)}ms / ${Math.round(cpuUsage.system / 1000)}ms`, inline: true },
      { name: "Environment Variables", value: envLines.join("\n"), inline: false },
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const toggleDebugBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      const current = rootLog.getConfig();
      const newLevel = current.minLevel === LogLevel.DEBUG ? LogLevel.INFO : LogLevel.DEBUG;
      rootLog.configure({ minLevel: newLevel });

      const label = newLevel === LogLevel.DEBUG ? "DEBUG" : "INFO";
      await ctx.originalInteraction.followUp({ content: `🪲 Log level set to **${label}**.`, ephemeral: true });
      await ctx.navigate(PanelId.DEBUG);
    }, PANEL_TTL)
    .setLabel(isDebug ? "🟢 Switch to INFO" : "🟡 Switch to DEBUG")
    .setStyle(isDebug ? ButtonStyle.Success : ButtonStyle.Secondary);

  const sentryTestBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      try {
        captureException(new Error("Dev Panel: Sentry test exception"), { context: "dev-panel-debug-test" });
        await ctx.originalInteraction.followUp({ content: "💥 Test exception sent to Sentry.", ephemeral: true });
      } catch (err) {
        await ctx.originalInteraction.followUp({
          content: `❌ Failed to send test exception: ${err instanceof Error ? err.message : "Unknown"}`,
          ephemeral: true,
        });
      }
    }, PANEL_TTL)
    .setLabel("💥 Test Sentry")
    .setStyle(ButtonStyle.Danger);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.DEBUG);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  await Promise.all([toggleDebugBtn.ready(), sentryTestBtn.ready(), refreshBtn.ready()]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, toggleDebugBtn, sentryTestBtn, refreshBtn)],
  };
}
