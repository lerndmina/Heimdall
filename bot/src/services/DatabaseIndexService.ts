import mongoose from "mongoose";
import log from "../utils/log";
import FetchEnvs from "../utils/FetchEnvs";

const env = FetchEnvs();

export class DatabaseIndexService {
  /**
   * Ensure all required indexes exist for modmail message tracking
   */
  static async ensureModmailIndexes(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Database connection not established");
      }

      const collectionName = env.MODMAIL_TABLE;

      // Check if collection exists, create it if it doesn't
      const collections = await db.listCollections({ name: collectionName }).toArray();
      if (collections.length === 0) {
        log.info(`Creating modmail collection: ${collectionName}`);
        await db.createCollection(collectionName);
      }

      const collection = db.collection(collectionName);

      // Check if the compound index exists
      const existingIndexes = await collection.indexes();
      const requiredIndexName = "userId_1_messages.messageId_1";

      const indexExists = existingIndexes.some(
        (index) =>
          index.name === requiredIndexName ||
          (index.key && index.key.userId === 1 && index.key["messages.messageId"] === 1)
      );

      if (!indexExists) {
        log.info(`Creating compound index for modmail message tracking...`);

        await collection.createIndex(
          {
            userId: 1,
            "messages.messageId": 1,
          },
          {
            name: requiredIndexName,
            background: true,
            sparse: true,
          }
        );

        log.info(`Successfully created compound index: ${requiredIndexName}`);
      } else {
        log.debug(`Compound index already exists: ${requiredIndexName}`);
      }

      // Create additional useful indexes
      await this.ensureAdditionalIndexes(collection);
    } catch (error) {
      log.error(`Failed to ensure modmail indexes: ${error}`);
      throw error;
    }
  }

  /**
   * Create additional useful indexes for modmail operations
   */
  private static async ensureAdditionalIndexes(collection: any): Promise<void> {
    const additionalIndexes = [
      // Index for finding messages by Discord message IDs and URLs
      {
        key: { "messages.discordMessageId": 1 },
        name: "messages_discordMessageId_1",
        sparse: true,
      },
      {
        key: { "messages.discordMessageUrl": 1 },
        name: "messages_discordMessageUrl_1",
        sparse: true,
      },
      {
        key: { "messages.webhookMessageId": 1 },
        name: "messages_webhookMessageId_1",
        sparse: true,
      },
      {
        key: { "messages.webhookMessageUrl": 1 },
        name: "messages_webhookMessageUrl_1",
        sparse: true,
      },
      {
        key: { "messages.dmMessageId": 1 },
        name: "messages_dmMessageId_1",
        sparse: true,
      },
      {
        key: { "messages.dmMessageUrl": 1 },
        name: "messages_dmMessageUrl_1",
        sparse: true,
      },
      // Index for message type and deletion status queries
      {
        key: {
          userId: 1,
          "messages.type": 1,
          "messages.isDeleted": 1,
        },
        name: "userId_1_messages_type_1_messages_isDeleted_1",
        sparse: true,
      },
      // Index for message creation time (useful for recent messages)
      {
        key: {
          userId: 1,
          "messages.createdAt": -1,
        },
        name: "userId_1_messages_createdAt_-1",
        sparse: true,
      },
    ];

    for (const indexSpec of additionalIndexes) {
      try {
        const existingIndexes = await collection.indexes();
        const indexExists = existingIndexes.some((index) => index.name === indexSpec.name);

        if (!indexExists) {
          await collection.createIndex(indexSpec.key, {
            name: indexSpec.name,
            background: true,
            sparse: indexSpec.sparse,
          });
          log.debug(`Created index: ${indexSpec.name}`);
        }
      } catch (error) {
        log.warn(`Failed to create index ${indexSpec.name}: ${error}`);
        // Don't throw here, as some indexes might fail due to data constraints
      }
    }
  }

  /**
   * Check database connection and initialize indexes
   */
  static async initializeDatabase(): Promise<void> {
    try {
      // Wait for mongoose connection to be ready
      if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
          mongoose.connection.once("connected", resolve);
          mongoose.connection.once("error", reject);
          setTimeout(() => reject(new Error("Database connection timeout")), 10000);
        });
      }

      log.info("Database connected, ensuring indexes...");
      await this.ensureModmailIndexes();
      log.info("Database initialization complete");
    } catch (error) {
      log.error(`Database initialization failed: ${error}`);
      // Don't throw the error - allow the bot to continue running
      // Indexes will be created when the first modmail document is inserted
      log.warn("Continuing without indexes - they will be created when needed");
    }
  }

  /**
   * Get index statistics for monitoring
   */
  static async getIndexStats(): Promise<any> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Database connection not established");
      }

      const collection = db.collection(env.MODMAIL_TABLE);
      const indexes = await collection.indexes();

      return {
        collection: env.MODMAIL_TABLE,
        indexes: indexes.map((index: any) => ({
          name: index.name,
          key: index.key,
          unique: index.unique || false,
          sparse: index.sparse || false,
        })),
      };
    } catch (error) {
      log.error(`Failed to get index stats: ${error}`);
      return null;
    }
  }
}

export default DatabaseIndexService;
