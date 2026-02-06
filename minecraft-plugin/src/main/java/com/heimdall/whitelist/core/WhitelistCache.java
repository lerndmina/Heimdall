package com.heimdall.whitelist.core;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Platform-agnostic whitelist cache.
 * Caches whitelist decisions to reduce API calls.
 */
public class WhitelistCache {
  private final PluginLogger logger;
  private final File cacheFile;
  private final Map<String, CacheEntry> cache;
  private final Gson gson;
  private final long cacheWindowMs;
  private final long extendOnJoinMs;
  private final long extendOnLeaveMs;

  public WhitelistCache(PluginLogger logger, File dataFolder, long cacheWindowMinutes, long extendOnJoinMinutes,
      long extendOnLeaveMinutes) {
    this.logger = logger;
    this.cacheFile = new File(dataFolder, "whitelist-cache.json");
    this.cache = new ConcurrentHashMap<>();
    this.gson = new Gson();
    this.cacheWindowMs = cacheWindowMinutes * 60 * 1000;
    this.extendOnJoinMs = extendOnJoinMinutes * 60 * 1000;
    this.extendOnLeaveMs = extendOnLeaveMinutes * 60 * 1000;

    loadCache();
  }

  public static class CacheEntry {
    public String username;
    public String uuid;
    public long lastConnection;
    public long cacheExpiry;
    public boolean whitelisted;

    public CacheEntry() {
    }

    public CacheEntry(String username, String uuid, long lastConnection, long cacheExpiry, boolean whitelisted) {
      this.username = username;
      this.uuid = uuid;
      this.lastConnection = lastConnection;
      this.cacheExpiry = cacheExpiry;
      this.whitelisted = whitelisted;
    }
  }

  /**
   * Check if a player is cached and whitelisted
   * Note: We only cache positive results, so null means either not cached or not
   * whitelisted
   *
   * @param uuid     Player's UUID
   * @param username Player's username
   * @return true if cached and whitelisted, null if not cached or cache expired
   */
  public Boolean isCachedWhitelisted(String uuid, String username) {
    // If UUID is null, we can't check the cache (which is keyed by UUID)
    if (uuid == null) {
      return null;
    }

    CacheEntry entry = cache.get(uuid);
    if (entry == null) {
      return null; // Not cached
    }

    long now = System.currentTimeMillis();
    if (now > entry.cacheExpiry) {
      // Cache expired, remove entry
      cache.remove(uuid);
      saveCache();
      return null;
    }

    // Update username if it changed
    if (!entry.username.equals(username)) {
      entry.username = username;
      saveCache();
    }

    // We only cache positive results, so if it's in cache, it's whitelisted
    return entry.whitelisted ? true : null;
  }

  /**
   * Add a whitelisted player to the cache
   * Note: We only cache positive results to allow newly whitelisted players to
   * join immediately
   *
   * @param uuid     Player's UUID
   * @param username Player's username
   */
  public void addWhitelistedPlayer(String uuid, String username) {
    // If UUID is null, we can't cache (cache is keyed by UUID)
    if (uuid == null) {
      logger.warning("Cannot cache whitelisted player with null UUID: " + username);
      return;
    }

    long now = System.currentTimeMillis();
    CacheEntry entry = new CacheEntry(
        username,
        uuid,
        now,
        now + cacheWindowMs,
        true);
    cache.put(uuid, entry);
    saveCache();

    logger.info("Added whitelisted player to cache: " + username + " (" + uuid + ")" +
        ", expires in " + (cacheWindowMs / 60000) + " minutes");
  }

  /**
   * Extend cache for a player who joined (they were allowed, so extend their
   * cache)
   *
   * @param uuid     Player's UUID
   * @param username Player's username
   */
  public void extendCacheOnJoin(String uuid, String username) {
    // If UUID is null, we can't extend cache (cache is keyed by UUID)
    if (uuid == null) {
      return;
    }

    CacheEntry entry = cache.get(uuid);
    if (entry != null && entry.whitelisted) {
      long now = System.currentTimeMillis();
      entry.lastConnection = now;
      entry.cacheExpiry = now + extendOnJoinMs;
      entry.username = username; // Update username in case it changed
      saveCache();

      logger.info("Extended cache on join for " + username + " (" + uuid + "), expires in " +
          (extendOnJoinMs / 60000) + " minutes");
    }
  }

  /**
   * Extend cache for a player who left (they were clearly allowed, so extend
   * their cache)
   *
   * @param uuid     Player's UUID
   * @param username Player's username
   */
  public void extendCacheOnLeave(String uuid, String username) {
    // If UUID is null, we can't extend cache (cache is keyed by UUID)
    if (uuid == null) {
      return;
    }

    CacheEntry entry = cache.get(uuid);
    if (entry != null && entry.whitelisted) {
      long now = System.currentTimeMillis();
      entry.cacheExpiry = now + extendOnLeaveMs;
      entry.username = username; // Update username in case it changed
      saveCache();

      logger.info("Extended cache on leave for " + username + " (" + uuid + "), expires in " +
          (extendOnLeaveMs / 60000) + " minutes");
    }
  }

  /**
   * Clean up expired cache entries
   */
  public void cleanupExpiredEntries() {
    long now = System.currentTimeMillis();
    int removedCount = 0;

    for (Map.Entry<String, CacheEntry> entry : cache.entrySet()) {
      if (now > entry.getValue().cacheExpiry) {
        cache.remove(entry.getKey());
        removedCount++;
      }
    }

    if (removedCount > 0) {
      saveCache();
      logger.info("Cleaned up " + removedCount + " expired cache entries");
    }
  }

  /**
   * Get cache statistics
   *
   * @return Cache stats string
   */
  public String getCacheStats() {
    int totalEntries = cache.size();
    int whitelistedEntries = 0;
    long now = System.currentTimeMillis();
    int expiredEntries = 0;

    for (CacheEntry entry : cache.values()) {
      if (entry.whitelisted) {
        whitelistedEntries++;
      }
      if (now > entry.cacheExpiry) {
        expiredEntries++;
      }
    }

    return "Total: " + totalEntries + ", Whitelisted: " + whitelistedEntries + ", Expired: " + expiredEntries;
  }

  /**
   * Clear the cache
   */
  public void clear() {
    cache.clear();
    saveCache();
    logger.info("Whitelist cache cleared");
  }

  /**
   * Load cache from file
   */
  private void loadCache() {
    if (!cacheFile.exists()) {
      return;
    }

    try (FileReader reader = new FileReader(cacheFile)) {
      Type type = new TypeToken<Map<String, CacheEntry>>() {
      }.getType();
      Map<String, CacheEntry> loadedCache = gson.fromJson(reader, type);
      if (loadedCache != null) {
        cache.putAll(loadedCache);
        logger.info("Loaded " + cache.size() + " cache entries from file");
      }
    } catch (IOException e) {
      logger.warning("Failed to load cache from file: " + e.getMessage());
    }
  }

  /**
   * Save cache to file
   */
  private void saveCache() {
    try {
      // Ensure parent directory exists
      if (!cacheFile.getParentFile().exists()) {
        cacheFile.getParentFile().mkdirs();
      }

      try (FileWriter writer = new FileWriter(cacheFile)) {
        gson.toJson(cache, writer);
      }
    } catch (IOException e) {
      logger.warning("Failed to save cache to file: " + e.getMessage());
    }
  }

  /**
   * Shutdown the cache (save to file)
   */
  public void shutdown() {
    saveCache();
  }
}
