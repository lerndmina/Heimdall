#!/usr/bin/env -S bun run
/**
 * Migration to fix MinecraftPlayer UUID index constraint
 *
 * Problem: The compound unique index on guildId + minecraftUuid doesn't allow
 * multiple documents with null values, causing E11000 duplicate key errors
 * when importing username-only players.
 *
 * Solution: Replace the sparse index with a partial index that only enforces
 * uniqueness when minecraftUuid is not null.
 */

import mongoose from "mongoose";
import log from "../utils/log.js";

async function fixUuidIndexConstraint() {
  try {
    log.info("🔧 Starting UUID index constraint fix migration...");

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
    log.info("📋 Current indexes:");
    indexes.forEach((idx) => log.info(`  - ${idx.name}: ${JSON.stringify(idx.key)}`));

    // Check if the problematic index exists
    const problematicIndex = indexes.find(
      (idx) =>
        idx.name === "guildId_1_minecraftUuid_1" ||
        (idx.key && idx.key.guildId === 1 && idx.key.minecraftUuid === 1)
    );

    if (problematicIndex) {
      log.info(`🗑️  Dropping existing problematic index: ${problematicIndex.name}`);
      await collection.dropIndex(problematicIndex.name);
      log.info("✅ Old index dropped successfully");
    } else {
      log.info("ℹ️  No problematic index found, skipping drop step");
    }

    // Create the new partial index
    log.info("🔧 Creating new partial index for UUID uniqueness...");
    await collection.createIndex(
      { guildId: 1, minecraftUuid: 1 },
      {
        unique: true,
        partialFilterExpression: {
          minecraftUuid: { $exists: true, $type: "string" },
        },
        name: "guildId_1_minecraftUuid_1_partial",
      }
    );
    log.info("✅ New partial index created successfully");

    // Verify the new index structure
    const newIndexes = await collection.indexes();
    const newIndex = newIndexes.find((idx) => idx.name === "guildId_1_minecraftUuid_1_partial");

    if (newIndex) {
      log.info("✅ Index verification successful:");
      log.info(`  - Name: ${newIndex.name}`);
      log.info(`  - Key: ${JSON.stringify(newIndex.key)}`);
      log.info(`  - Unique: ${newIndex.unique}`);
      log.info(`  - Partial Filter: ${JSON.stringify(newIndex.partialFilterExpression)}`);
    }

    log.info("🎉 UUID index constraint fix completed successfully!");
    return true;
  } catch (error) {
    log.error("❌ Failed to fix UUID index constraint:", error);
    return false;
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
        retryWrites: true,
      });
      log.info("🔌 Connected to MongoDB");

      await fixUuidIndexConstraint();

      await mongoose.disconnect();
      log.info("🔌 Disconnected from MongoDB");
      process.exit(0);
    } catch (error) {
      log.error("❌ Migration script failed:", error);
      process.exit(1);
    }
  })();
}

export { fixUuidIndexConstraint };
