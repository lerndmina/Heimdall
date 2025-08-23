package com.heimdall.whitelist;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Type;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class WhitelistCache {
  private final JavaPlugin plugin;
  private final File cacheFile;
  private final Map<String, CacheEntry> cache;
  private final Gson gson;
  private final long cacheWindowMs;
  private final long extendOnJoinMs;
  private final long extendOnLeaveMs;

  public WhitelistCache(JavaPlugin plugin, long cacheWindowMinutes, long extendOnJoinMinutes,
      long extendOnLeaveMinutes) {
    this.plugin = plugin;
    this.cacheFile = new File(plugin.getDataFolder(), "whitelist-cache.json");
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
      plugin.getLogger().warning("Cannot cache whitelisted player with null UUID: " + username);
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

    plugin.getLogger().info("Added whitelisted player to cache: " + username + " (" + uuid + ")" +
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

      plugin.getLogger().info("Extended cache on join for " + username + " (" + uuid + "), expires in " +
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
      entry.lastConnection = now;
      entry.cacheExpiry = now + extendOnLeaveMs;
      entry.username = username; // Update username in case it changed
      saveCache();

      plugin.getLogger().info("Extended cache on leave for " + username + " (" + uuid + "), expires in " +
          (extendOnLeaveMs / 60000) + " minutes");
    }
  }

  /**
   * Remove a player from the cache
   * 
   * @param uuid Player's UUID
   */
  public void removeFromCache(String uuid) {
    // If UUID is null, we can't remove from cache (cache is keyed by UUID)
    if (uuid == null) {
      return;
    }

    if (cache.remove(uuid) != null) {
      saveCache();
      plugin.getLogger().info("Removed player " + uuid + " from cache");
    }
  }

  /**
   * Clear expired entries from cache
   */
  public void cleanupExpiredEntries() {
    long now = System.currentTimeMillis();
    int sizeBefore = cache.size();

    cache.entrySet().removeIf(entry -> now > entry.getValue().cacheExpiry);

    int removed = sizeBefore - cache.size();
    if (removed > 0) {
      saveCache();
      plugin.getLogger().info("Cleaned up " + removed + " expired cache entries");
    }
  }

  /**
   * Get cache statistics
   */
  public String getCacheStats() {
    long now = System.currentTimeMillis();
    int total = cache.size();
    int whitelisted = 0;
    int expired = 0;

    for (CacheEntry entry : cache.values()) {
      if (entry.whitelisted)
        whitelisted++;
      if (now > entry.cacheExpiry)
        expired++;
    }

    return String.format("Cache Stats: %d total, %d whitelisted, %d expired", total, whitelisted, expired);
  }

  private void loadCache() {
    if (!cacheFile.exists()) {
      plugin.getLogger().info("No whitelist cache file found, starting with empty cache");
      return;
    }

    try (FileReader reader = new FileReader(cacheFile)) {
      Type type = new TypeToken<Map<String, CacheEntry>>() {
      }.getType();
      Map<String, CacheEntry> loadedCache = gson.fromJson(reader, type);

      if (loadedCache != null) {
        cache.putAll(loadedCache);
        plugin.getLogger().info("Loaded " + cache.size() + " entries from whitelist cache");

        // Clean up expired entries on load
        cleanupExpiredEntries();
      }
    } catch (IOException e) {
      plugin.getLogger().severe("Failed to load whitelist cache: " + e.getMessage());
    }
  }

  private void saveCache() {
    try {
      // Ensure data folder exists
      if (!plugin.getDataFolder().exists()) {
        plugin.getDataFolder().mkdirs();
      }

      try (FileWriter writer = new FileWriter(cacheFile)) {
        gson.toJson(cache, writer);
      }
    } catch (IOException e) {
      plugin.getLogger().severe("Failed to save whitelist cache: " + e.getMessage());
    }
  }

  /**
   * Save cache and cleanup resources
   */
  public void shutdown() {
    saveCache();
    cache.clear();
    plugin.getLogger().info("Whitelist cache saved and shutdown");
  }
}
