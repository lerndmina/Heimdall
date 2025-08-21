#!/usr/bin/env -S bun run
/**
 * Migration to fix MinecraftPlayer UUID index
 *
 * Problem: The compound unique index on guildId + minecraftUuid doesn't allow
 * multiple null values, causing errors when manually adding players without UUIDs.
 *
 * Solution: Replace the sparse index with a partial index that only enforces
 * uniqueness when minecraftUuid exists and is a string.
 */

import mongoose from "mongoose";
import log from "../utils/log";

async function fixMinecraftUuidIndex() {
  try {
    log.info("🔧 Starting MinecraftPlayer UUID index migration...");

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not available");
    }

    log.info(`📍 Connected to database: ${db.databaseName}`);

    const collection = db.collection("minecraftplayers");

    // Check if collection exists
    const collections = await db.listCollections({ name: "minecraftplayers" }).toArray();
    if (collections.length === 0) {
      log.info("ℹ️  Collection 'minecraftplayers' does not exist yet. Migration not needed.");
      return true;
    }

    // Get existing indexes
    const indexes = await collection.indexes();
    log.info(
      "📋 Current indexes:",
      indexes.map((idx) => ({ name: idx.name, key: idx.key }))
    );

    // Check if the problematic index exists
    const problematicIndex = indexes.find(
      (idx) =>
        idx.name === "guildId_1_minecraftUuid_1" ||
        (idx.key && idx.key.guildId === 1 && idx.key.minecraftUuid === 1)
    );

    if (problematicIndex) {
      log.info(`🗑️  Dropping existing index: ${problematicIndex.name}`);
      await collection.dropIndex(problematicIndex.name);
      log.info("✅ Successfully dropped old index");
    } else {
      log.info("ℹ️  No problematic index found to drop");
    }

    // Create the new partial index
    log.info("🔨 Creating new partial index for guildId + minecraftUuid...");
    await collection.createIndex(
      { guildId: 1, minecraftUuid: 1 },
      {
        unique: true,
        partialFilterExpression: { minecraftUuid: { $exists: true, $type: "string" } },
        name: "guildId_1_minecraftUuid_1_partial",
      }
    );
    log.info("✅ Successfully created new partial index");

    // Verify the new index
    const newIndexes = await collection.indexes();
    const newIndex = newIndexes.find((idx) => idx.name === "guildId_1_minecraftUuid_1_partial");

    if (newIndex) {
      log.info("✅ New index verified:", {
        name: newIndex.name,
        key: newIndex.key,
        unique: newIndex.unique,
        partialFilterExpression: newIndex.partialFilterExpression,
      });
    }

    log.info("🎉 Migration completed successfully!");
    return true;
  } catch (error) {
    log.error("❌ Migration failed:", error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  (async () => {
    try {
      // Connect to MongoDB using same logic as bot
      const mongoUri = process.env.MONGODB_URI;
      const mongoDatabase = process.env.MONGODB_DATABASE || "test";
      
      if (!mongoUri) {
        throw new Error("MONGODB_URI environment variable is required");
      }

      log.info(`🔌 Connecting to MongoDB database: ${mongoDatabase}`);
      await mongoose.connect(mongoUri, { 
        dbName: mongoDatabase, 
        retryWrites: true 
      });
      log.info("🔌 Connected to MongoDB");

      await fixMinecraftUuidIndex();

      await mongoose.disconnect();
      log.info("🔌 Disconnected from MongoDB");
      process.exit(0);
    } catch (error) {
      log.error("❌ Migration script failed:", error);
      process.exit(1);
    }
  })();
}

export { fixMinecraftUuidIndex };
