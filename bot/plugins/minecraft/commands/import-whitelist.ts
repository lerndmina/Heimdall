/**
 * /import-whitelist — Import legacy whitelist data from a MongoDB JSON export
 *
 * Accepts a JSON file attachment containing an array of old MinecraftPlayer
 * and/or MinecraftAuthPending documents. Maps fields to the current schema,
 * skips duplicates, and reports results.
 *
 * Requires ManageGuild permission.
 */

import { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";
import { createLogger } from "../../../src/core/Logger.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import { mapOldToNew, type OldPlayerDoc } from "../lib/whitelistImport.js";

const log = createLogger("minecraft:import-whitelist");

export const data = new SlashCommandBuilder()
  .setName("import-whitelist")
  .setDescription("Import legacy whitelist data from a MongoDB JSON export")
  .addAttachmentOption((opt) => opt.setName("file").setDescription("JSON file exported from MongoDB (array of documents)").setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("How to handle duplicate players (default: skip)")
      .setRequired(false)
      .addChoices({ name: "Skip duplicates", value: "skip" }, { name: "Overwrite duplicates", value: "overwrite" }),
  )
  .addBooleanOption((opt) => opt.setName("dry-run").setDescription("Preview what would be imported without making changes").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const config = { allowInDMs: false };

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const attachment = interaction.options.getAttachment("file", true);
  const mode = (interaction.options.getString("mode") ?? "skip") as "skip" | "overwrite";
  const dryRun = interaction.options.getBoolean("dry-run") ?? false;

  // Validate file
  if (!attachment.name.endsWith(".json")) {
    await interaction.editReply("❌ Please upload a `.json` file.");
    return;
  }

  if (attachment.size > 25 * 1024 * 1024) {
    await interaction.editReply("❌ File is too large (max 25 MB).");
    return;
  }

  // Download & parse
  let docs: OldPlayerDoc[];
  try {
    const resp = await fetch(attachment.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    // Handle both regular JSON arrays and NDJSON (newline-delimited JSON from mongoexport)
    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
      docs = JSON.parse(trimmed);
    } else {
      // NDJSON: one JSON object per line
      docs = trimmed
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line.trim()));
    }

    if (!Array.isArray(docs) || docs.length === 0) {
      await interaction.editReply("❌ File must contain a non-empty array of documents (or NDJSON lines).");
      return;
    }
  } catch (err) {
    log.error("Failed to parse import file:", err);
    await interaction.editReply("❌ Failed to parse JSON file. Make sure it's a valid JSON array or NDJSON export.");
    return;
  }

  // Process
  const results = {
    total: docs.length,
    imported: 0,
    skipped: 0,
    overwritten: 0,
    errors: [] as string[],
  };

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(dryRun ? "🔍 Import Preview (Dry Run)" : "⏳ Importing…")
    .setDescription(`Processing ${docs.length} record(s)…`);

  await interaction.editReply({ embeds: [embed] });

  for (const doc of docs) {
    const username = doc.minecraftUsername;

    if (!username) {
      results.errors.push("Skipped record with no minecraftUsername");
      continue;
    }

    try {
      const mapped = mapOldToNew(doc, guildId);

      // Check for existing player (by username, case-insensitive)
      const existing = await MinecraftPlayer.findOne({
        guildId,
        minecraftUsername: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      });

      if (existing) {
        if (mode === "skip") {
          results.skipped++;
          continue;
        }

        // Overwrite mode: update the existing record
        if (!dryRun) {
          // Don't overwrite guildId, _id
          delete mapped.guildId;
          await MinecraftPlayer.findByIdAndUpdate(existing._id, { $set: mapped }, { runValidators: true });
        }
        results.overwritten++;
        continue;
      }

      // New player
      if (!dryRun) {
        await MinecraftPlayer.create(mapped);
      }
      results.imported++;
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Truncate individual error messages
      results.errors.push(`${username}: ${msg.length > 80 ? msg.slice(0, 80) + "…" : msg}`);
    }
  }

  // Build result embed
  const statusColor = results.errors.length > 0 ? 0xed4245 : 0x57f287;
  const resultEmbed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(statusColor)
    .setTitle(dryRun ? "🔍 Import Preview (Dry Run)" : "✅ Import Complete")
    .addFields(
      { name: "Total Records", value: String(results.total), inline: true },
      { name: dryRun ? "Would Import" : "Imported", value: String(results.imported), inline: true },
      { name: "Skipped (duplicate)", value: String(results.skipped), inline: true },
    );

  if (results.overwritten > 0) {
    resultEmbed.addFields({ name: dryRun ? "Would Overwrite" : "Overwritten", value: String(results.overwritten), inline: true });
  }

  if (results.errors.length > 0) {
    resultEmbed.addFields({
      name: `Errors (${results.errors.length})`,
      value: results.errors.length <= 10 ? results.errors.join("\n") : results.errors.slice(0, 10).join("\n") + `\n…and ${results.errors.length - 10} more`,
    });
  }

  if (dryRun) {
    resultEmbed.setFooter({ text: "This was a dry run — no changes were made. Remove the dry-run option to import for real." });
  }

  const replyOptions: { embeds: any[]; files?: AttachmentBuilder[] } = { embeds: [resultEmbed] };

  // If there are many errors, attach a full error log
  if (results.errors.length > 10) {
    const errorLog = results.errors.join("\n");
    const buffer = Buffer.from(errorLog, "utf-8");
    replyOptions.files = [new AttachmentBuilder(buffer, { name: "import-errors.txt" })];
  }

  await interaction.editReply(replyOptions);

  if (!dryRun && (results.imported > 0 || results.overwritten > 0)) {
    broadcastDashboardChange(guildId, "minecraft", "players_imported", { requiredAction: "minecraft.view_players" });
  }

  log.info(`[${guildId}] Whitelist import: ${results.imported} imported, ${results.skipped} skipped, ${results.overwritten} overwritten, ${results.errors.length} errors (dry-run: ${dryRun})`);
}
