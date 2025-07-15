import { redisClient } from "../Bot";
import { ModmailConfigType } from "../models/ModmailConfig";
import Database from "./data/database";
import ModmailConfig from "../models/ModmailConfig";
import log from "./log";

const CONFIG_CACHE_TTL = 300; // 5 minutes in seconds
const GUILD_CACHE_TTL = 600; // 10 minutes in seconds

/**
 * Centralized modmail cache management utility
 */
export class ModmailCache {
  /**
   * Get modmail config with Redis caching
   */
  static async getModmailConfig(guildId: string, db?: Database): Promise<ModmailConfigType | null> {
    const cacheKey = `modmail:config:${guildId}`;

    try {
      // Try to get from Redis cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        log.debug(`Cache hit for modmail config: ${guildId}`);
        return JSON.parse(cached);
      }

      // Cache miss - fetch from database
      log.debug(`Cache miss for modmail config: ${guildId}`);
      const database = db || new Database();
      const config = await database.findOne(ModmailConfig, { guildId });

      if (config) {
        // Cache the config with TTL
        await redisClient.setEx(cacheKey, CONFIG_CACHE_TTL, JSON.stringify(config));
        log.debug(`Cached modmail config for guild: ${guildId}`);
      }

      return config;
    } catch (error) {
      log.warn(`Redis cache error for modmail config ${guildId}: ${error}`);
      // Fallback to direct database query
      const database = db || new Database();
      return await database.findOne(ModmailConfig, { guildId });
    }
  }

  /**
   * Set modmail config in cache (used after updates)
   */
  static async setModmailConfig(guildId: string, config: ModmailConfigType): Promise<void> {
    const cacheKey = `modmail:config:${guildId}`;

    try {
      await redisClient.setEx(cacheKey, CONFIG_CACHE_TTL, JSON.stringify(config));
      log.debug(`Updated modmail config cache for guild: ${guildId}`);
    } catch (error) {
      log.warn(`Failed to update modmail config cache for guild ${guildId}: ${error}`);
    }
  }

  /**
   * Invalidate modmail config cache for a specific guild
   */
  static async invalidateModmailConfig(guildId: string): Promise<void> {
    const cacheKey = `modmail:config:${guildId}`;

    try {
      await redisClient.del(cacheKey);
      log.debug(`Invalidated modmail config cache for guild: ${guildId}`);
    } catch (error) {
      log.warn(`Failed to invalidate modmail config cache for guild ${guildId}: ${error}`);
    }
  }

  /**
   * Cache guild basic information
   */
  static async setGuildInfo(guildId: string, guildName: string): Promise<void> {
    const cacheKey = `guild:${guildId}`;
    const cacheInfo = {
      id: guildId,
      name: guildName,
      timestamp: Date.now(),
    };

    try {
      await redisClient.setEx(cacheKey, GUILD_CACHE_TTL, JSON.stringify(cacheInfo));
      log.debug(`Cached guild info for: ${guildId}`);
    } catch (error) {
      log.warn(`Failed to cache guild info for guild ${guildId}: ${error}`);
    }
  }

  /**
   * Get cached guild info (returns null if not cached or expired)
   */
  static async getGuildInfo(
    guildId: string
  ): Promise<{ id: string; name: string; timestamp: number } | null> {
    const cacheKey = `guild:${guildId}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const cacheInfo = JSON.parse(cached);
        if (Date.now() - cacheInfo.timestamp < GUILD_CACHE_TTL * 1000) {
          log.debug(`Cache hit for guild info: ${guildId}`);
          return cacheInfo;
        }
      }
      return null;
    } catch (error) {
      log.warn(`Redis cache error for guild info ${guildId}: ${error}`);
      return null;
    }
  }

  /**
   * Invalidate guild cache for a specific guild
   */
  static async invalidateGuild(guildId: string): Promise<void> {
    const cacheKey = `guild:${guildId}`;

    try {
      await redisClient.del(cacheKey);
      log.debug(`Invalidated guild cache for: ${guildId}`);
    } catch (error) {
      log.warn(`Failed to invalidate guild cache for guild ${guildId}: ${error}`);
    }
  }

  /**
   * Clear all modmail-related caches for a guild
   */
  static async clearGuildCaches(guildId: string): Promise<void> {
    await Promise.all([this.invalidateModmailConfig(guildId), this.invalidateGuild(guildId)]);
    log.debug(`Cleared all caches for guild: ${guildId}`);
  }

  /**
   * Warm up cache for a guild (preload commonly accessed data)
   */
  static async warmUpGuildCache(guildId: string, db?: Database): Promise<void> {
    try {
      // Preload modmail config
      await this.getModmailConfig(guildId, db);
      log.debug(`Warmed up cache for guild: ${guildId}`);
    } catch (error) {
      log.warn(`Failed to warm up cache for guild ${guildId}: ${error}`);
    }
  }

  /**
   * Get cache statistics (for monitoring)
   */
  static async getCacheStats(): Promise<{ configCacheHits: number; guildCacheHits: number }> {
    // This would require Redis to track hits, for now return placeholder
    return {
      configCacheHits: 0,
      guildCacheHits: 0,
    };
  }
}

export default ModmailCache;
