/**
 * QdrantClient - Singleton wrapper for Qdrant vector database
 *
 * Provides centralized access to Qdrant with connection management,
 * collection initialization, and health checks.
 */

import { QdrantClient as Qdrant } from "@qdrant/js-client-rest";
import fetchEnvs from "./FetchEnvs";
import log from "./log";

const env = fetchEnvs();

class QdrantClientWrapper {
  private static instance: Qdrant | null = null;
  private static isInitialized: boolean = false;
  private static collectionName: string = "context_chunks";

  /**
   * Gets the singleton Qdrant client instance
   */
  static getClient(): Qdrant {
    if (!this.instance) {
      // Parse URL to check if it's HTTPS
      const isHttps = env.QDRANT_URL.startsWith("https://");

      this.instance = new Qdrant({
        url: env.QDRANT_URL,
        apiKey: env.QDRANT_API_KEY,
        port: isHttps ? 443 : env.QDRANT_PORT, // Force 443 for HTTPS URLs
        https: isHttps, // Enable HTTPS if URL starts with https://
      });

      log.info("Qdrant client initialized", {
        url: env.QDRANT_URL,
        port: isHttps ? 443 : env.QDRANT_PORT,
        https: isHttps,
      });
    }

    return this.instance;
  }

  /**
   * Verifies connection to Qdrant and creates collection if needed
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.debug("Qdrant already initialized");
      return;
    }

    try {
      const client = this.getClient();

      // Test connection
      log.info("Testing Qdrant connection...");
      const collections = await client.getCollections();
      log.info("Qdrant connection successful", {
        existingCollections: collections.collections.length,
      });

      // Check if our collection exists
      const collectionExists = collections.collections.some((c) => c.name === this.collectionName);

      if (!collectionExists) {
        log.info(`Creating Qdrant collection: ${this.collectionName}`);
        await client.createCollection(this.collectionName, {
          vectors: {
            size: 1536, // text-embedding-3-small dimensions
            distance: "Cosine", // Cosine similarity
          },
          optimizers_config: {
            indexing_threshold: 10000,
          },
        });

        log.info(`Qdrant collection created: ${this.collectionName}`);
      } else {
        log.info(`Qdrant collection already exists: ${this.collectionName}`);
      }

      this.isInitialized = true;
    } catch (error) {
      log.error("Failed to initialize Qdrant:", error);
      throw new Error(`Qdrant initialization failed: ${error}`);
    }
  }

  /**
   * Gets the collection name used for context chunks
   */
  static getCollectionName(): string {
    return this.collectionName;
  }

  /**
   * Health check for Qdrant connection
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.getCollections();
      return true;
    } catch (error) {
      log.error("Qdrant health check failed:", error);
      return false;
    }
  }
}

export default QdrantClientWrapper;
