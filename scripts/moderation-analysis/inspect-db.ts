#!/usr/bin/env bun
/**
 * Database inspection script to see what moderation data exists
 */

import mongoose from "mongoose";
import { configDotenv } from "dotenv";
import { join } from "path";

// Load environment variables from bot directory
configDotenv({ path: join(process.cwd(), "../../bot/.env") });

async function connectToDatabase(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const mongoDatabase = process.env.MONGODB_DATABASE || "solaceBot";

    if (!mongoUri) {
      throw new Error("MONGODB_URI not found in environment variables");
    }

    // Connect with database name specified in options
    await mongoose.connect(mongoUri, {
      dbName: mongoDatabase,
    });
    console.log(`✅ Connected to MongoDB database: ${mongoDatabase}`);
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

async function inspectDatabase() {
  console.log("🔍 Inspecting database for moderation data...");

  try {
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("\n📁 Available collections:");
    collections.forEach((col) => {
      console.log(`  • ${col.name}`);
    });

    // Look for moderation-related collections
    const moderationCollections = collections.filter((col) => col.name.toLowerCase().includes("moderation") || col.name.toLowerCase().includes("report") || col.name.toLowerCase().includes("hit"));

    if (moderationCollections.length > 0) {
      console.log("\n🎯 Found moderation-related collections:");

      for (const col of moderationCollections) {
        console.log(`\n📊 Collection: ${col.name}`);
        const collection = mongoose.connection.db.collection(col.name);
        const count = await collection.countDocuments();
        console.log(`  Document count: ${count}`);

        if (count > 0) {
          // Get a sample document
          const sample = await collection.findOne();
          console.log("  Sample document structure:");
          console.log("  ", Object.keys(sample || {}).join(", "));

          // Check for status field
          if (sample && "status" in sample) {
            const statusCounts = await collection.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray();
            console.log("  Status breakdown:");
            statusCounts.forEach((s: any) => {
              console.log(`    ${s._id}: ${s.count}`);
            });
          }
        }
      }
    } else {
      console.log("\n❓ No obvious moderation collections found. Checking for documents with moderation fields...");

      // Check all collections for documents that might be moderation reports
      for (const col of collections) {
        const collection = mongoose.connection.db.collection(col.name);
        const count = await collection.countDocuments();

        if (count > 0) {
          // Look for documents with moderation-like fields
          const sample = await collection.findOne();
          const keys = Object.keys(sample || {});

          const hasModerationFields = keys.some((key) => key.includes("confidence") || key.includes("flagged") || key.includes("moderation") || key.includes("report"));

          if (hasModerationFields) {
            console.log(`\n🔍 Collection '${col.name}' might contain moderation data:`);
            console.log(`  Document count: ${count}`);
            console.log(`  Fields: ${keys.join(", ")}`);
          }
        }
      }
    }

    // Try the exact model name from the bot
    console.log("\n🔍 Checking for 'moderationhits' collection specifically...");
    try {
      const moderationHits = mongoose.connection.db.collection("moderationhits");
      const hitCount = await moderationHits.countDocuments();
      console.log(`ModerationHits count: ${hitCount}`);

      if (hitCount > 0) {
        const sample = await moderationHits.findOne();
        console.log("Sample ModerationHit:", sample);
      }
    } catch (error) {
      console.log("No moderationhits collection found");
    }
  } catch (error) {
    console.error("❌ Inspection failed:", error);
  }
}

async function main() {
  try {
    await connectToDatabase();
    await inspectDatabase();
  } catch (error) {
    console.error("❌ Script failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected from database");
  }
}

if (import.meta.main) {
  main();
}
