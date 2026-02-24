/**
 * Cache / Redis Panel — Inspect, ping, and flush the Redis cache.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, requireConfirmation, PANEL_TTL, PanelId, formatBytes, type DevPanelContext, type PanelResult } from "../devPanel.js";

export async function buildCachePanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib, redis } = ctx;

  // ── Gather Redis stats ───────────────────────────────────────────────────
  let dbSize = 0;
  let pingLatency = 0;
  let memoryUsed = "N/A";
  let connected = false;

  try {
    const pingStart = Date.now();
    await redis.ping();
    pingLatency = Date.now() - pingStart;
    connected = true;

    dbSize = await redis.dbSize();

    const memInfo = await redis.info("memory");
    const match = memInfo.match(/used_memory_human:(\S+)/);
    if (match?.[1]) memoryUsed = match[1];
  } catch {
    // Redis may be unavailable
  }

  const embed = lib
    .createEmbedBuilder()
    .setTitle("💾 Cache / Redis")
    .addFields(
      { name: "Status", value: connected ? "🟢 Connected" : "🔴 Disconnected", inline: true },
      { name: "Ping", value: connected ? `${pingLatency}ms` : "—", inline: true },
      { name: "Keys", value: connected ? dbSize.toLocaleString() : "—", inline: true },
      { name: "Memory", value: memoryUsed, inline: true },
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.CACHE);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  const flushBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const confirmed = await requireConfirmation(i, "Flush Redis", "FLUSH REDIS", "This will delete ALL keys from the Redis database.");
      if (!confirmed) return;

      try {
        await redis.flushDb();
        await ctx.originalInteraction.followUp({ content: "✅ Redis database flushed.", ephemeral: true });
      } catch (err) {
        await ctx.originalInteraction.followUp({
          content: `❌ Failed to flush Redis: ${err instanceof Error ? err.message : "Unknown error"}`,
          ephemeral: true,
        });
      }

      await ctx.navigate(PanelId.CACHE);
    }, PANEL_TTL)
    .setLabel("🗑️ Flush All")
    .setStyle(ButtonStyle.Danger);

  await Promise.all([refreshBtn.ready(), flushBtn.ready()]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn, flushBtn)],
  };
}
