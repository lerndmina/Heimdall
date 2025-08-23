/**
 * Migration to fix the UUID unique index constraint
 *
 * This migration:
 * 1. Drops the old guildId_1_minecraftUuid_1 index that was causing issues with null UUIDs
 * 2. Creates a new partial index that only applies when minecraftUuid is not null
 *
 * This allows multiple username-only imports per guild while maintaining UUID uniqueness
 */

import mongoose from "mongoose";
import log from "../utils/log.js";

export async function fixUuidIndex() {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection("minecraftplayers");

    log.info("[Migration] Starting UUID index fix...");

    // Check if the old index exists
    const indexes = await collection.indexes();
    const oldIndexExists = indexes.some((index) => index.name === "guildId_1_minecraftUuid_1");

    if (oldIndexExists) {
      log.info("[Migration] Dropping old guildId_1_minecraftUuid_1 index...");
      await collection.dropIndex("guildId_1_minecraftUuid_1");
      log.info("[Migration] ✅ Old index dropped successfully");
    } else {
      log.info("[Migration] Old index doesn't exist, skipping drop");
    }

    // Create the new partial index
    log.info("[Migration] Creating new partial index for UUID uniqueness...");
    await collection.createIndex(
      { guildId: 1, minecraftUuid: 1 },
      {
        unique: true,
        partialFilterExpression: { minecraftUuid: { $ne: null } },
        name: "guildId_1_minecraftUuid_1_partial",
      }
    );
    log.info("[Migration] ✅ New partial index created successfully");

    // Verify the new index structure
    const newIndexes = await collection.indexes();
    const newIndex = newIndexes.find((index) => index.name === "guildId_1_minecraftUuid_1_partial");

    if (newIndex) {
      log.info("[Migration] ✅ Index verification successful:", {
        name: newIndex.name,
        key: newIndex.key,
        unique: newIndex.unique,
        partialFilterExpression: newIndex.partialFilterExpression,
      });
    }

    log.info("[Migration] UUID index fix completed successfully!");
    return true;
  } catch (error) {
    log.error("[Migration] Failed to fix UUID index:", error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  import("../Bot.js").then(async () => {
    const success = await fixUuidIndex();
    process.exit(success ? 0 : 1);
  });
}
