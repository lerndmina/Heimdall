#!/usr/bin/env node

// Database initialization script for production deployment
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["info", "warn", "error"],
});

async function initializeDatabase() {
  console.log("🔄 Initializing database...");

  try {
    // Test basic connectivity
    console.log("⏳ Testing database connectivity...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connection successful");

    // Check if any tables exist
    console.log("⏳ Checking database schema...");
    const tables = (await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `) as Array<{ table_name: string }>;

    console.log(`📊 Found ${tables.length} tables in database`);

    if (tables.length === 0) {
      console.log("🏗️  No tables found, database schema needs to be created");
      console.log("ℹ️  Run 'bunx prisma db push' to create the schema");
    } else {
      console.log("✅ Database schema appears to be initialized");
      console.log("📋 Tables:", tables.map((t) => t.table_name).join(", "));
    }
  } catch (error) {
    console.error("❌ Database initialization failed:");
    if (error instanceof Error) {
      console.error("Error message:", error.message);

      if (error.message.includes("Can't reach database server")) {
        console.error("🔌 Database server is not reachable. Please check:");
        console.error("  - Database server is running");
        console.error("  - DATABASE_URL environment variable is correct");
        console.error("  - Network connectivity to database host");
      } else if (error.message.includes("authentication")) {
        console.error("🔐 Database authentication failed. Please check:");
        console.error("  - Database username and password in DATABASE_URL");
        console.error("  - Database user has required permissions");
      } else if (error.message.includes("database") && error.message.includes("does not exist")) {
        console.error("🗄️  Database does not exist. Please check:");
        console.error("  - Database name in DATABASE_URL is correct");
        console.error("  - Database has been created on the server");
      }
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log("🎉 Database initialization completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fatal error during database initialization:", error);
      process.exit(1);
    });
}

export { initializeDatabase };
