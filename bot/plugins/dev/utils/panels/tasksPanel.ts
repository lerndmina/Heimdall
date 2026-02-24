/**
 * Tasks Panel — View all registered background tasks and their state.
 *
 * Reads from the BackgroundTaskRegistry plus probes known services
 * that use setInterval but may not have registered themselves.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { taskRegistry, type BackgroundTask } from "../../services/BackgroundTaskRegistry.js";

function formatInterval(ms: number): string {
  if (ms <= 0) return "dynamic";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  const m = s / 60;
  if (m < 60) return `${m}m`;
  const h = m / 60;
  return `${h}h`;
}

/**
 * Known background tasks that may not self-register.
 * These are populated as hardcoded defaults so the panel always
 * shows them even if the owning plugin hasn't opted in.
 */
function ensureKnownTasks(): void {
  const known: Array<{ id: string; plugin: string; label: string; intervalMs: number; description: string }> = [
    { id: "ws-heartbeat", plugin: "dashboard", label: "WS Heartbeat", intervalMs: 30_000, description: "Pings WebSocket clients and cleans stale connections" },
    { id: "ws-permission-refresh", plugin: "dashboard", label: "WS Permission Refresh", intervalMs: 300_000, description: "Refreshes dashboard permissions for connected users" },
    { id: "ticket-archive-cleanup", plugin: "tickets", label: "Ticket Archive Cleanup", intervalMs: 86_400_000, description: "Cleans up expired ticket archives" },
    { id: "ticket-reminder", plugin: "tickets", label: "Ticket Reminder", intervalMs: 60_000, description: "Sends reminders for inactive tickets" },
    { id: "transcription-queue", plugin: "vc-transcription", label: "Transcription Queue", intervalMs: 5_000, description: "Processes queued voice transcriptions" },
    { id: "scheduled-action-processor", plugin: "moderation", label: "Scheduled Actions", intervalMs: 60_000, description: "Processes scheduled moderation actions (unbans, unmutes)" },
    { id: "reminder-service", plugin: "reminders", label: "Reminder Service", intervalMs: 10_000, description: "Checks and sends due reminders" },
    { id: "background-modmail", plugin: "modmail", label: "Background Modmail", intervalMs: 600_000, description: "Processes background modmail tasks" },
    { id: "logging-event-service", plugin: "logging", label: "Logging Event Service", intervalMs: 300_000, description: "Flushes buffered logging events" },
    { id: "census-monitor", plugin: "planetside", label: "Census Monitor", intervalMs: 300_000, description: "Monitors PlanetSide 2 Census API for events" },
  ];

  for (const k of known) {
    if (!taskRegistry.get(k.id)) {
      taskRegistry.register({ ...k, isRunning: false });
    }
  }
}

export async function buildTasksPanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib } = ctx;

  // Ensure known tasks are populated
  ensureKnownTasks();

  const tasks = taskRegistry.getAll();

  // ── Build embed ──────────────────────────────────────────────────────────
  const lines: string[] = [];

  if (tasks.length === 0) {
    lines.push("No background tasks registered.");
  } else {
    // Group by plugin
    const grouped = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const list = grouped.get(t.plugin) ?? [];
      list.push(t);
      grouped.set(t.plugin, list);
    }

    for (const [plugin, pluginTasks] of grouped) {
      lines.push(`**${plugin}**`);
      for (const t of pluginTasks) {
        const icon = t.isRunning ? "🟢" : "⚫";
        const interval = formatInterval(t.intervalMs);
        lines.push(`> ${icon} **${t.label}** · every \`${interval}\`${t.description ? ` — ${t.description}` : ""}`);
      }
      lines.push("");
    }
  }

  const description = lines.join("\n");
  const running = tasks.filter((t: BackgroundTask) => t.isRunning).length;

  const embed = lib
    .createEmbedBuilder()
    .setTitle("⏰ Background Tasks")
    .setDescription(description.length > 4096 ? description.slice(0, 4090) + "\n..." : description)
    .setFooter({ text: `${tasks.length} tasks registered · ${running} running` });

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.TASKS);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  await refreshBtn.ready();

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn)],
  };
}
