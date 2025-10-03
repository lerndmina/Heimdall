/**
 * TemporaryContextManager - Utility for managing temporary message context in Redis
 *
 * Provides functions to store, retrieve, and manage temporary message context
 * that users can reference in their ask commands.
 *
 * Storage Format: HelpieContext:{userId}:{messageId} -> message content
 * TTL: 5 minutes (300 seconds)
 */

import { redisClient } from "../index";
import log from "./log";

export class TemporaryContextManager {
  private static readonly TTL = 300; // 5 minutes in seconds
  private static readonly KEY_PREFIX = "HelpieContext";

  /**
   * Store a message in temporary context
   *
   * @param userId - Discord user ID
   * @param messageId - Discord message ID
   * @param content - Message content to store
   * @returns Promise resolving to true if successful
   *
   * @example
   * await TemporaryContextManager.store('123456789', '987654321', 'Hello world');
   */
  static async store(userId: string, messageId: string, content: string): Promise<boolean> {
    if (!redisClient.isReady) {
      log.error("Cannot store context: Redis is not connected");
      return false;
    }

    try {
      const key = this.buildKey(userId, messageId);
      await redisClient.setEx(key, this.TTL, content);
      log.debug(`Stored temporary context: ${key} (${content.length} chars, ${this.TTL}s TTL)`);
      return true;
    } catch (error) {
      log.error("Failed to store temporary context:", error);
      return false;
    }
  }

  /**
   * Retrieve a specific message from temporary context
   *
   * @param userId - Discord user ID
   * @param messageId - Discord message ID
   * @returns Promise resolving to message content or null if not found
   *
   * @example
   * const content = await TemporaryContextManager.get('123456789', '987654321');
   */
  static async get(userId: string, messageId: string): Promise<string | null> {
    if (!redisClient.isReady) {
      log.error("Cannot retrieve context: Redis is not connected");
      return null;
    }

    try {
      const key = this.buildKey(userId, messageId);
      const content = await redisClient.get(key);
      return content;
    } catch (error) {
      log.error("Failed to retrieve temporary context:", error);
      return null;
    }
  }

  /**
   * Get all temporary context messages for a user
   *
   * @param userId - Discord user ID
   * @returns Promise resolving to array of { messageId, content, ttl } objects
   *
   * @example
   * const contexts = await TemporaryContextManager.getAllForUser('123456789');
   * // Returns: [{ messageId: '987654321', content: 'Hello', ttl: 245 }]
   */
  static async getAllForUser(userId: string): Promise<Array<{ messageId: string; content: string; ttl: number }>> {
    if (!redisClient.isReady) {
      log.error("Cannot list contexts: Redis is not connected");
      return [];
    }

    try {
      const pattern = `${this.KEY_PREFIX}:${userId}:*`;
      const keys = await redisClient.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      // Fetch all values and TTLs in parallel
      const results = await Promise.all(
        keys.map(async (key) => {
          const [content, ttl] = await Promise.all([redisClient.get(key), redisClient.ttl(key)]);

          // Extract messageId from key (HelpieContext:userId:messageId)
          const messageId = key.split(":")[2];

          return {
            messageId,
            content: content || "",
            ttl: ttl || 0,
          };
        })
      );

      return results.filter((r) => r.content); // Filter out any null values
    } catch (error) {
      log.error("Failed to list temporary contexts:", error);
      return [];
    }
  }

  /**
   * Delete a specific temporary context
   *
   * @param userId - Discord user ID
   * @param messageId - Discord message ID
   * @returns Promise resolving to true if deleted successfully
   *
   * @example
   * await TemporaryContextManager.delete('123456789', '987654321');
   */
  static async delete(userId: string, messageId: string): Promise<boolean> {
    if (!redisClient.isReady) {
      log.error("Cannot delete context: Redis is not connected");
      return false;
    }

    try {
      const key = this.buildKey(userId, messageId);
      const result = await redisClient.del(key);
      log.debug(`Deleted temporary context: ${key} (result: ${result})`);
      return result > 0;
    } catch (error) {
      log.error("Failed to delete temporary context:", error);
      return false;
    }
  }

  /**
   * Delete all temporary contexts for a user
   *
   * @param userId - Discord user ID
   * @returns Promise resolving to number of keys deleted
   *
   * @example
   * const deleted = await TemporaryContextManager.deleteAllForUser('123456789');
   */
  static async deleteAllForUser(userId: string): Promise<number> {
    if (!redisClient.isReady) {
      log.error("Cannot delete contexts: Redis is not connected");
      return 0;
    }

    try {
      const pattern = `${this.KEY_PREFIX}:${userId}:*`;
      const keys = await redisClient.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const result = await redisClient.del(keys);
      log.debug(`Deleted ${result} temporary contexts for user ${userId}`);
      return result;
    } catch (error) {
      log.error("Failed to delete temporary contexts:", error);
      return 0;
    }
  }

  /**
   * Get the remaining TTL for a specific context
   *
   * @param userId - Discord user ID
   * @param messageId - Discord message ID
   * @returns Promise resolving to TTL in seconds, or -2 if key doesn't exist
   *
   * @example
   * const ttl = await TemporaryContextManager.getTTL('123456789', '987654321');
   */
  static async getTTL(userId: string, messageId: string): Promise<number> {
    if (!redisClient.isReady) {
      log.error("Cannot get TTL: Redis is not connected");
      return -2;
    }

    try {
      const key = this.buildKey(userId, messageId);
      return await redisClient.ttl(key);
    } catch (error) {
      log.error("Failed to get TTL:", error);
      return -2;
    }
  }

  /**
   * Build Redis key from userId and messageId
   *
   * @param userId - Discord user ID
   * @param messageId - Discord message ID
   * @returns Formatted Redis key
   */
  private static buildKey(userId: string, messageId: string): string {
    return `${this.KEY_PREFIX}:${userId}:${messageId}`;
  }

  /**
   * Check if Redis is ready
   *
   * @returns Boolean indicating if Redis is connected
   */
  static isAvailable(): boolean {
    return redisClient.isReady;
  }
}

export default TemporaryContextManager;
