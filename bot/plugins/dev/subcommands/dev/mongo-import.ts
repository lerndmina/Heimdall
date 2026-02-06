/**
 * /dev mongo-import — Upload a MongoDB JSON export into a database/collection
 *
 * Accepts a JSON attachment that is either:
 *  - A JSON array of documents: [{ ... }, { ... }]
 *  - Newline-delimited JSON (mongoexport --type=json format): { ... }\n{ ... }
 *
 * Connects to the same MongoDB cluster using mongoose.createConnection(),
 * targeting the specified database. Creates the database and collection
 * automatically if they don't exist (MongoDB creates on first write).
 */

import mongoose from "mongoose";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("dev:mongo-import");

export async function handleMongoImport(context: CommandContext): Promise<void> {
  const { interaction } = context;
  await interaction.deferReply({ ephemeral: true });

  const attachment = interaction.options.getAttachment("file", true);
  const databaseName = interaction.options.getString("database", true);
  const collectionName = interaction.options.getString("collection", true);
  const dropFirst = interaction.options.getBoolean("drop") || false;

  // ── Validate attachment ──────────────────────────────────────────
  if (!attachment.contentType?.includes("json") && !attachment.name?.endsWith(".json")) {
    await interaction.editReply({ content: "❌ Please upload a `.json` file." });
    return;
  }

  // 25 MB safety limit (Discord's max upload anyway)
  if (attachment.size > 25 * 1024 * 1024) {
    await interaction.editReply({ content: "❌ File too large (max 25 MB)." });
    return;
  }

  const envUri = process.env.MONGODB_URI;
  if (!envUri) {
    await interaction.editReply({ content: "❌ `MONGODB_URI` not configured." });
    return;
  }

  let conn: mongoose.Connection | null = null;

  try {
    // ── Download and parse ───────────────────────────────────────────
    await interaction.editReply({ content: `⏳ Downloading \`${attachment.name}\`…` });

    const response = await fetch(attachment.url);
    if (!response.ok) {
      await interaction.editReply({ content: `❌ Failed to download file: HTTP ${response.status}` });
      return;
    }

    const raw = await response.text();
    let documents: any[];

    try {
      // Try standard JSON array first
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        documents = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        // Single document
        documents = [parsed];
      } else {
        await interaction.editReply({ content: "❌ JSON must be an array of documents or a single object." });
        return;
      }
    } catch {
      // Try newline-delimited JSON (NDJSON / mongoexport format)
      try {
        documents = raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line));
      } catch {
        await interaction.editReply({ content: "❌ Could not parse file as JSON array or newline-delimited JSON." });
        return;
      }
    }

    if (documents.length === 0) {
      await interaction.editReply({ content: "❌ No documents found in the file." });
      return;
    }

    // ── Connect and import ───────────────────────────────────────────
    await interaction.editReply({
      content: `⏳ Connecting to database \`${databaseName}\` and importing **${documents.length}** document(s) into \`${collectionName}\`…`,
    });

    conn = mongoose.createConnection(envUri, { dbName: databaseName });
    await conn.asPromise();

    const db = conn.db;
    if (!db) {
      await interaction.editReply({ content: "❌ Failed to get database handle." });
      return;
    }

    const collection = db.collection(collectionName);

    if (dropFirst) {
      try {
        await collection.drop();
        log.info(`Dropped collection ${databaseName}.${collectionName}`);
      } catch {
        // Collection may not exist yet — that's fine
      }
    }

    // Process $oid and $date fields from MongoDB extended JSON format
    const processed = documents.map((doc) => processExtendedJson(doc));

    const result = await collection.insertMany(processed, { ordered: false });

    const inserted = result.insertedCount;
    log.info(`Imported ${inserted} documents into ${databaseName}.${collectionName}`);

    await interaction.editReply({
      content:
        `✅ **Import complete**\n` +
        `> Database: \`${databaseName}\`\n` +
        `> Collection: \`${collectionName}\`\n` +
        `> Documents inserted: **${inserted}**` +
        (dropFirst ? "\n> ⚠️ Collection was dropped before import" : ""),
    });
  } catch (error) {
    log.error("Mongo import failed:", error);
    await interaction.editReply({
      content: `❌ Import failed:\n\`\`\`${error instanceof Error ? error.message : String(error)}\`\`\``,
    });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Recursively process MongoDB Extended JSON fields:
 * - `{ "$oid": "..." }` → `new mongoose.Types.ObjectId("...")`
 * - `{ "$date": "..." }` → `new Date("...")`
 * - `{ "$numberLong": "..." }` → `Number("...")`
 * - `{ "$numberInt": "..." }` → `Number("...")`
 * - `{ "$numberDouble": "..." }` → `Number("...")`
 */
function processExtendedJson(value: any): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => processExtendedJson(item));
  }

  if (typeof value === "object") {
    // Check for extended JSON types
    if (value.$oid && typeof value.$oid === "string") {
      return new mongoose.Types.ObjectId(value.$oid);
    }
    if (value.$date !== undefined) {
      const dateVal = typeof value.$date === "object" && value.$date.$numberLong ? Number(value.$date.$numberLong) : value.$date;
      return new Date(dateVal);
    }
    if (value.$numberLong !== undefined) {
      return Number(value.$numberLong);
    }
    if (value.$numberInt !== undefined) {
      return Number(value.$numberInt);
    }
    if (value.$numberDouble !== undefined) {
      return Number(value.$numberDouble);
    }

    // Recurse into nested objects
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = processExtendedJson(val);
    }
    return result;
  }

  return value;
}
