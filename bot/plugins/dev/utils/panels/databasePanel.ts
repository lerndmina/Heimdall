/**
 * Database Panel — MongoDB stats, collection info, and the nuclear drop-all option.
 */

import { ActionRowBuilder, ButtonStyle, type ButtonInteraction } from "discord.js";
import { createBackButton, requireConfirmation, PANEL_TTL, PanelId, formatBytes, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { dropAllCollections } from "../dropCollections.js";

export async function buildDatabasePanel(ctx: DevPanelContext): Promise<PanelResult> {
  const { lib, mongoose } = ctx;

  // ── Gather MongoDB stats ─────────────────────────────────────────────────
  let connected = false;
  let dbName = "—";
  let collectionCount = 0;
  let docCount = 0;
  let dataSize = "—";

  try {
    const conn = mongoose.connection;
    connected = conn.readyState === 1;

    if (connected && conn.db) {
      dbName = conn.db.databaseName;
      const collections = await conn.db.listCollections().toArray();
      collectionCount = collections.length;

      const stats = await conn.db.stats();
      docCount = stats.objects ?? 0;
      dataSize = formatBytes(stats.dataSize ?? 0);
    }
  } catch {
    // DB may be unavailable
  }

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🗄️ Database")
    .addFields(
      { name: "Status", value: connected ? "🟢 Connected" : "🔴 Disconnected", inline: true },
      { name: "Database", value: dbName, inline: true },
      { name: "Collections", value: String(collectionCount), inline: true },
      { name: "Documents", value: docCount.toLocaleString(), inline: true },
      { name: "Data Size", value: dataSize, inline: true },
    );

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      await ctx.navigate(PanelId.DATABASE);
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);

  const dropBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const confirmed = await requireConfirmation(i, "Drop All Collections", "DROP ALL", "This will DELETE every document from all Heimdall-managed collections. This CANNOT be undone.");
      if (!confirmed) return;

      // Show progress via follow-ups
      const progressMsg = await ctx.originalInteraction.followUp({ content: "🗑️ Dropping collections… (0/?)", ephemeral: true });

      const result = await dropAllCollections({
        onProgress: (event) => {
          progressMsg.edit(`🗑️ Dropping collections… (${event.completed}/${event.total}) — ${event.label}`).catch(() => {});
        },
      });

      const totalDeleted = Object.values(result).reduce((sum, r) => sum + r.deleted, 0);
      const failures = Object.entries(result).filter(([, r]) => !r.success);

      let summary = `✅ Dropped **${totalDeleted}** documents from **${Object.keys(result).length}** collections.`;
      if (failures.length > 0) {
        summary += `\n⚠️ ${failures.length} failed: ${failures.map(([label]) => `\`${label}\``).join(", ")}`;
      }

      await progressMsg.edit(summary);
      await ctx.navigate(PanelId.DATABASE);
    }, PANEL_TTL)
    .setLabel("💣 Drop All")
    .setStyle(ButtonStyle.Danger);

  await Promise.all([refreshBtn.ready(), dropBtn.ready()]);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<any>().addComponents(backBtn, refreshBtn, dropBtn)],
  };
}
