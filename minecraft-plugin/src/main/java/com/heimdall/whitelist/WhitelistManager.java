package com.heimdall.whitelist;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;

public class WhitelistManager {

  private final HeimdallWhitelistPlugin plugin;
  private final ApiClient apiClient;
  private final ConcurrentHashMap<String, CachedResponse> cache;
  private final SimpleDateFormat dateFormat;
  private volatile String lastCheckTime;

  public WhitelistManager(HeimdallWhitelistPlugin plugin, ApiClient apiClient) {
    this.plugin = plugin;
    this.apiClient = apiClient;
    this.cache = new ConcurrentHashMap<>();
    this.dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
    this.lastCheckTime = "Never";

    // Start cache cleanup task
    startCacheCleanupTask();
  }

  public WhitelistResponse checkPlayerWhitelist(String username, String uuid, String ip) throws Exception {
    // Validate input parameters
    if (username == null || username.trim().isEmpty()) {
      throw new IllegalArgumentException("Username cannot be null or empty");
    }

    // Use UUID as primary cache key, fallback to username if UUID is null
    String cacheKey = uuid != null ? uuid : username.toLowerCase();

    // Check cache first
    CachedResponse cached = cache.get(cacheKey);
    if (cached != null && !cached.isExpired()) {
      if (plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger().info("Using cached whitelist result for " + username + " (" + uuid + ")");
      }
      return cached.getResponse();
    }

    // Get current groups for role sync
    java.util.List<String> currentGroups = null;
    if (uuid != null) {
      try {
        java.util.UUID playerUuid = java.util.UUID.fromString(uuid);
        LuckPermsManager luckPermsManager = plugin.getLuckPermsManager();
        if (luckPermsManager != null && luckPermsManager.isAvailable()) {
          currentGroups = luckPermsManager.getPlayerGroups(playerUuid);
        }
      } catch (Exception e) {
        if (plugin.getConfig().getBoolean("logging.debug", false)) {
          plugin.getLogger().warning("Failed to get current groups for " + username + ": " + e.getMessage());
        }
      }
    }

    // Make API request
    try {
      WhitelistResponse response = apiClient.checkWhitelist(username, uuid, ip, currentGroups).get(
          plugin.getConfig().getInt("api.timeout", 5000) + 1000, // Add 1 second buffer
          TimeUnit.MILLISECONDS);

      // Cache successful responses (when player is allowed)
      if (response.shouldBeWhitelisted()) {
        long cacheTimeout = plugin.getConfig().getInt("performance.cacheTimeout", 30) * 1000L;
        cache.put(cacheKey, new CachedResponse(response, System.currentTimeMillis() + cacheTimeout));

        if (plugin.getConfig().getBoolean("logging.debug", false)) {
          plugin.getLogger().info("Cached successful whitelist result for " + username + " (" + uuid + ")");
        }
      } else {
        if (plugin.getConfig().getBoolean("logging.debug", false)) {
          plugin.getLogger().info("Not caching failed whitelist result for " + username + " (" + uuid + ")");
        }
      }

      // Update last check time
      lastCheckTime = dateFormat.format(new Date());

      return response;
    } catch (Exception e) {
      plugin.getLogger().log(Level.WARNING, "API request failed for " + username + ": " + e.getMessage());
      throw e;
    }
  }

  public String getLastCheckTime() {
    return lastCheckTime;
  }

  public void clearCache() {
    cache.clear();
    plugin.getLogger().info("Whitelist cache cleared");
  }

  public void clearCacheForPlayer(String username, String uuid) {
    // Validate input parameters
    if (username == null || username.trim().isEmpty()) {
      plugin.getLogger().warning("clearCacheForPlayer called with null or empty username");
      return;
    }

    // Clear cache for both username and UUID if available
    if (uuid != null) {
      cache.remove(uuid);
    }
    cache.remove(username.toLowerCase());
    if (plugin.getConfig().getBoolean("logging.debug", false)) {
      plugin.getLogger().info("Cleared cache for player: " + username + " (" + uuid + ")");
    }
  }

  public String requestLinkCode(String username, String uuid) throws Exception {
    // Validate input parameters
    if (username == null || username.trim().isEmpty()) {
      throw new IllegalArgumentException("Username cannot be null or empty");
    }
    if (uuid == null || uuid.trim().isEmpty()) {
      throw new IllegalArgumentException("UUID cannot be null or empty");
    }

    // Make API request for link code
    try {
      WhitelistResponse response = apiClient.requestLinkCode(username, uuid).get(
          plugin.getConfig().getInt("api.timeout", 5000) + 1000, // Add 1 second buffer
          TimeUnit.MILLISECONDS);

      // Update last check time
      lastCheckTime = dateFormat.format(new Date());

      // Extract auth code from response
      if (response.getAuthCode() != null && !response.getAuthCode().isEmpty()) {
        return response.getAuthCode();
      } else {
        throw new Exception("No auth code received from API");
      }

    } catch (Exception e) {
      plugin.getLogger().log(Level.SEVERE, "Failed to request link code for " + username, e);
      lastCheckTime = dateFormat.format(new Date()) + " (ERROR)";
      throw e;
    }
  }

  private void startCacheCleanupTask() {
    // Run cache cleanup every 5 minutes
    plugin.getServer().getScheduler().runTaskTimerAsynchronously(plugin, () -> {
      // Count entries before cleanup for debug logging
      int sizeBefore = cache.size();

      // Remove expired entries
      cache.entrySet().removeIf(entry -> entry.getValue().isExpired());

      int removedCount = sizeBefore - cache.size();
      if (removedCount > 0 && plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger().info("Cleaned up " + removedCount + " expired cache entries");
      }
    }, 20L * 60 * 5, 20L * 60 * 5); // 5 minutes in ticks
  }

  private static class CachedResponse {
    private final WhitelistResponse response;
    private final long expiryTime;

    public CachedResponse(WhitelistResponse response, long expiryTime) {
      this.response = response;
      this.expiryTime = expiryTime;
    }

    public WhitelistResponse getResponse() {
      return response;
    }

    public boolean isExpired() {
      return System.currentTimeMillis() > expiryTime;
    }
  }
}
