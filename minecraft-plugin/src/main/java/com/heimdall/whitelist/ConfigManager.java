package com.heimdall.whitelist;

import org.bukkit.configuration.file.FileConfiguration;

public class ConfigManager {

  private final HeimdallWhitelistPlugin plugin;
  private FileConfiguration config;

  public ConfigManager(HeimdallWhitelistPlugin plugin) {
    this.plugin = plugin;
    reload();
  }

  public void reload() {
    plugin.reloadConfig();
    config = plugin.getConfig();

    // Validate configuration
    validateConfig();
  }

  private void validateConfig() {
    String baseUrl = config.getString("api.baseUrl", "");
    if (baseUrl.isEmpty()) {
      plugin.getLogger().warning("API base URL is not configured! Please set 'api.baseUrl' in config.yml");
    }

    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      plugin.getLogger().warning("API base URL should start with http:// or https://");
    }

    int timeout = config.getInt("api.timeout", 5000);
    if (timeout < 1000) {
      plugin.getLogger().warning("API timeout is very low (" + timeout + "ms). Consider increasing it.");
    }

    int cacheTimeout = config.getInt("performance.cacheTimeout", 30);
    if (cacheTimeout < 10) {
      plugin.getLogger()
          .warning("Cache timeout is very low (" + cacheTimeout + "s). This may cause excessive API requests.");
    }

    plugin.getLogger().info("Configuration validated successfully");
  }

  public FileConfiguration getConfig() {
    return config;
  }
}
