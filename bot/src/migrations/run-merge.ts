import { runMigrationSafely } from "./merge-minecraft-collections.js";
import log from "../utils/log.js";
import mongoose from "mongoose";
import FetchEnvs from "../utils/FetchEnvs.js";

async function main() {
  const env = FetchEnvs();

  try {
    log.info("🚀 Starting Minecraft Collections Migration...");
    log.info("===============================================");

    // Connect to MongoDB
    log.info("🔌 Connecting to MongoDB...");
    await mongoose.connect(env.MONGODB_URI);
    log.info("✅ Connected to MongoDB");

    const result = await runMigrationSafely();

    if (result) {
      log.info("");
      log.info("🎉 Migration completed successfully!");
      log.info("===============================================");
      log.info("📊 Final Statistics:");
      log.info(`   ✅ Players updated: ${result.playersUpdated}`);
      log.info(`   🔗 Existing players linked: ${result.existingPlayersLinked}`);
      log.info(`   ➕ New players created: ${result.newPlayersCreated}`);
      log.info(`   📦 Auth records migrated: ${result.authRecordsMigrated}`);
      log.info(`   📈 Total players: ${result.finalPlayerCount}`);

      log.info("");
      log.info("⚠️  NEXT STEPS:");
      log.info("1. Test the application thoroughly");
      log.info("2. Verify dashboard and commands work correctly");
      log.info("3. Backup MinecraftAuthPending collection");
      log.info("4. Drop MinecraftAuthPending collection after verification");
      log.info("5. Update code to remove MinecraftAuthPending references");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    log.error("💥 Migration failed:", error);
    log.error("");
    log.error("Please check the error above and fix any issues before retrying.");

    // Ensure we disconnect even on error
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      log.error("Failed to disconnect from MongoDB:", disconnectError);
    }

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  log.warn("");
  log.warn("🛑 Migration cancelled by user");
  process.exit(1);
});

process.on("SIGTERM", () => {
  log.warn("");
  log.warn("🛑 Migration terminated");
  process.exit(1);
});

main();
