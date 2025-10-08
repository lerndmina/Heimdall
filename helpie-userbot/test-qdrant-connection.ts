/**
 * Test Qdrant Connection
 *
 * Quick script to verify Qdrant instance is accessible and working
 * Run with: bunx tsx test-qdrant-connection.ts
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { configDotenv } from "dotenv";

// Load environment variables
configDotenv();

const QDRANT_URL = process.env.QDRANT_URL || "https://qdrant.flythe.cloud";
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || "443");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "8aqC8pFJ8kPoEFaZzygGjgLTbAWGrnnogvXN7GwVEaszrPqt9U2Gdf7ybFsCEQ2mBJvRT7tgEzwzNNAe";

async function testConnection() {
  console.log("🔍 Testing Qdrant connection...");
  console.log(`📍 URL: ${QDRANT_URL}`);
  console.log(`� Port: ${QDRANT_PORT}`);
  console.log(`�🔑 API Key: ${QDRANT_API_KEY.substring(0, 10)}...`);

  // First, try a basic fetch to check if URL is accessible
  console.log("\n🌐 Testing basic HTTP connectivity...");
  try {
    const response = await fetch(`${QDRANT_URL}/`, {
      method: "GET",
      headers: {
        "api-key": QDRANT_API_KEY,
      },
    });
    console.log(`✅ HTTP Response: ${response.status} ${response.statusText}`);

    if (response.status === 401 || response.status === 403) {
      console.error("❌ Authentication failed - API key may be invalid");
      process.exit(1);
    }
  } catch (fetchError: any) {
    console.error(`❌ Cannot reach URL: ${fetchError.message}`);
    console.error("\n💡 Possible issues:");
    console.error("   - URL may be incorrect");
    console.error("   - Firewall/network blocking the connection");
    console.error("   - Qdrant instance may be down");
    process.exit(1);
  }

  try {
    // Initialize client
    // For HTTPS URLs, specify port explicitly to prevent default :6333
    const client = new QdrantClient({
      url: QDRANT_URL,
      port: QDRANT_PORT,
      apiKey: QDRANT_API_KEY,
    });

    console.log(`\n✅ Qdrant client initialized (using port ${QDRANT_PORT})`);

    // Test 1: Get collections
    console.log("\n📦 Fetching collections...");
    const collections = await client.getCollections();
    console.log(`✅ Found ${collections.collections.length} collections`);

    if (collections.collections.length > 0) {
      console.log("Collections:", collections.collections.map((c) => c.name).join(", "));
    }

    // Test 2: Check if our collection exists
    const collectionName = "helpie_context_chunks";
    console.log(`\n🔍 Checking for collection: ${collectionName}`);

    try {
      const collectionInfo = await client.getCollection(collectionName);
      console.log(`✅ Collection exists!`);
      console.log(`   - Vectors: ${collectionInfo.vectors_count}`);
      console.log(`   - Points: ${collectionInfo.points_count}`);
    } catch (error: any) {
      if (error.message?.includes("Not found") || error.status === 404) {
        console.log(`⚠️  Collection doesn't exist yet (will be created on first use)`);
      } else {
        throw error;
      }
    }

    console.log("\n✅ All tests passed! Qdrant is ready to use.");
  } catch (error: any) {
    console.error("\n❌ Qdrant client error!");
    console.error("Error:", error.message);
    console.error("Full error:", JSON.stringify(error, null, 2));

    if (error.message?.includes("ENOTFOUND") || error.message?.includes("ECONNREFUSED")) {
      console.error("\n💡 Tip: Check that the Qdrant URL is correct and accessible");
    } else if (error.status === 401 || error.status === 403) {
      console.error("\n💡 Tip: API key may be invalid or expired");
    } else if (error.message?.includes("Unable to connect")) {
      console.error("\n💡 Possible issues:");
      console.error("   - Qdrant instance may require different authentication");
      console.error("   - Try checking Qdrant dashboard or logs");
      console.error("   - Verify API key format is correct");
    }

    process.exit(1);
  }
}

testConnection();
