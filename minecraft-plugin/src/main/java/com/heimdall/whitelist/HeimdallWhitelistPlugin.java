package com.heimdall.whitelist;

import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.event.Listener;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.ChatColor;
import java.util.UUID;

public class HeimdallWhitelistPlugin extends JavaPlugin implements Listener {

  private ApiClient apiClient;
  private ConfigManager configManager;
  private WhitelistManager whitelistManager;
  private WhitelistCache whitelistCache;
  private int cacheCleanupTaskId = -1;

  @Override
  public void onEnable() {
    // Save default config if it doesn't exist
    saveDefaultConfig();

    // Initialize managers
    configManager = new ConfigManager(this);
    apiClient = new ApiClient(this);
    whitelistManager = new WhitelistManager(this, apiClient);

    // Initialize whitelist cache
    long cacheWindow = getConfig().getLong("cache.cacheWindow", 60);
    long extendOnJoin = getConfig().getLong("cache.extendOnJoin", 120);
    long extendOnLeave = getConfig().getLong("cache.extendOnLeave", 180);
    whitelistCache = new WhitelistCache(this, cacheWindow, extendOnJoin, extendOnLeave);

    // Register events
    getServer().getPluginManager().registerEvents(new PlayerLoginListener(this), this);
    getServer().getPluginManager().registerEvents(new PlayerJoinLeaveListener(this), this);

    // Start cache cleanup task
    long cleanupInterval = getConfig().getLong("cache.cleanupInterval", 30) * 60 * 20; // Convert minutes to ticks
    cacheCleanupTaskId = getServer().getScheduler().runTaskTimerAsynchronously(this, () -> {
      whitelistCache.cleanupExpiredEntries();
    }, cleanupInterval, cleanupInterval).getTaskId();

    // Generate server ID if not set
    if (getConfig().getString("server.serverId", "").isEmpty()) {
      String serverId = UUID.randomUUID().toString();
      getConfig().set("server.serverId", serverId);
      saveConfig();
      getLogger().info("Generated new server ID: " + serverId);
    }

    getLogger().info("Heimdall Whitelist Plugin enabled successfully!");
    getLogger().info("API URL: " + getConfig().getString("api.baseUrl"));
    getLogger().info("Server ID: " + getConfig().getString("server.serverId"));

    // Check if plugin is enabled and warn accordingly
    boolean enabled = getConfig().getBoolean("enabled", false);
    if (enabled) {
      getLogger().info("Whitelist protection is ACTIVE - all players will be checked");
    } else {
      getLogger().warning("================================================");
      getLogger().warning("WHITELIST PROTECTION IS DISABLED!");
      getLogger().warning("All players can join without Discord verification!");
      getLogger().warning("Enable in config.yml or use '/hwl enable' command");
      getLogger().warning("================================================");
    }
  }

  @Override
  public void onDisable() {
    // Cancel cache cleanup task
    if (cacheCleanupTaskId != -1) {
      getServer().getScheduler().cancelTask(cacheCleanupTaskId);
    }

    // Shutdown cache
    if (whitelistCache != null) {
      whitelistCache.shutdown();
    }

    // Shutdown API client
    if (apiClient != null) {
      apiClient.shutdown();
    }

    getLogger().info("Heimdall Whitelist Plugin disabled!");
  }

  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (!command.getName().equalsIgnoreCase("hwl")) {
      return false;
    }

    if (!sender.hasPermission("heimdall.admin")) {
      sender.sendMessage(ChatColor.RED + "You don't have permission to use this command!");
      return true;
    }

    if (args.length == 0) {
      sender.sendMessage(ChatColor.YELLOW + "Heimdall Whitelist Commands:");
      sender.sendMessage(ChatColor.GRAY + "/hwl reload - Reload configuration");
      sender.sendMessage(ChatColor.GRAY + "/hwl status - Show plugin status");
      sender.sendMessage(ChatColor.GRAY + "/hwl enable - Enable the whitelist plugin");
      sender.sendMessage(ChatColor.GRAY + "/hwl disable - Disable the whitelist plugin");
      sender.sendMessage(ChatColor.GRAY + "/hwl test <player> - Test whitelist check for player");
      sender.sendMessage(ChatColor.GRAY + "/hwl cache stats - Show cache statistics");
      sender.sendMessage(ChatColor.GRAY + "/hwl cache clear - Clear the whitelist cache");
      sender.sendMessage(ChatColor.GRAY + "/hwl cache cleanup - Clean up expired cache entries");
      return true;
    }

    String subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case "reload":
        reloadConfig();
        configManager.reload();
        apiClient.updateConfig();
        sender.sendMessage(ChatColor.GREEN + getConfig().getString("messages.reloaded", "Plugin reloaded!"));
        return true;

      case "status":
        boolean enabled = getConfig().getBoolean("enabled", false);
        String enabledStatus = enabled ? "§aENABLED" : "§cDISABLED";

        String statusMsg = getConfig().getString("messages.status", "Status: OK")
            .replace("{url}", getConfig().getString("api.baseUrl", "Not set"))
            .replace("{serverId}", getConfig().getString("server.serverId", "Not set"))
            .replace("{lastCheck}", whitelistManager.getLastCheckTime());

        sender.sendMessage(ChatColor.translateAlternateColorCodes('&', statusMsg));
        sender.sendMessage(ChatColor.translateAlternateColorCodes('&', "§7Plugin Status: " + enabledStatus));

        if (!enabled) {
          sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
              "§eWarning: Plugin is disabled. All players can join without whitelist checks!"));
          sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
              "§7Enable in config.yml by setting 'enabled: true'"));
        }
        return true;

      case "enable":
        getConfig().set("enabled", true);
        saveConfig();
        sender.sendMessage(ChatColor.GREEN + "§aHeimdall Whitelist plugin enabled!");
        sender.sendMessage(ChatColor.YELLOW + "§eWhitelist checks are now active for all players.");
        return true;

      case "disable":
        getConfig().set("enabled", false);
        saveConfig();
        sender.sendMessage(ChatColor.RED + "§cHeimdall Whitelist plugin disabled!");
        sender.sendMessage(ChatColor.YELLOW + "§eWarning: All players can now join without whitelist checks!");
        return true;

      case "test":
        if (args.length < 2) {
          sender.sendMessage(ChatColor.RED + "Usage: /hwl test <username>");
          return true;
        }

        String testPlayer = args[1];
        sender.sendMessage(ChatColor.YELLOW + "Testing whitelist check for " + testPlayer + "...");

        // Perform async test
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
          try {
            WhitelistResponse response = whitelistManager.checkPlayerWhitelist(
                testPlayer,
                null, // UUID unknown for test
                sender instanceof Player ? ((Player) sender).getAddress().getAddress().getHostAddress() : "127.0.0.1");

            getServer().getScheduler().runTask(this, () -> {
              sender.sendMessage(ChatColor.GREEN + "Test Results for " + testPlayer + ":");
              sender.sendMessage(
                  ChatColor.GRAY + "Should be whitelisted: " + (response.shouldBeWhitelisted() ? "YES" : "NO"));
              sender.sendMessage(ChatColor.GRAY + "Has auth: " + (response.hasAuth() ? "YES" : "NO"));
              sender.sendMessage(ChatColor.GRAY + "Action: " + response.getAction());
              sender.sendMessage(ChatColor.GRAY + "Message: " + response.getKickMessage());
            });
          } catch (Exception e) {
            getServer().getScheduler().runTask(this, () -> {
              sender.sendMessage(ChatColor.RED + "Test failed: " + e.getMessage());
            });
          }
        });
        return true;

      case "cache":
        if (args.length < 2) {
          sender.sendMessage(ChatColor.RED + "Usage: /hwl cache <stats|clear|cleanup>");
          return true;
        }

        String cacheSubCommand = args[1].toLowerCase();
        switch (cacheSubCommand) {
          case "stats":
            sender.sendMessage(ChatColor.YELLOW + "Whitelist Cache Statistics:");
            sender.sendMessage(ChatColor.GRAY + whitelistCache.getCacheStats());
            return true;

          case "clear":
            // Clear the cache by creating a new instance
            long cacheWindow = getConfig().getLong("cache.cacheWindow", 60);
            long extendOnJoin = getConfig().getLong("cache.extendOnJoin", 120);
            long extendOnLeave = getConfig().getLong("cache.extendOnLeave", 180);
            whitelistCache.shutdown();
            whitelistCache = new WhitelistCache(this, cacheWindow, extendOnJoin, extendOnLeave);
            sender.sendMessage(ChatColor.GREEN + "Whitelist cache cleared successfully!");
            return true;

          case "cleanup":
            whitelistCache.cleanupExpiredEntries();
            sender.sendMessage(ChatColor.GREEN + "Expired cache entries cleaned up!");
            return true;

          default:
            sender.sendMessage(ChatColor.RED + "Unknown cache subcommand: " + cacheSubCommand);
            sender.sendMessage(ChatColor.GRAY + "Available: stats, clear, cleanup");
            return true;
        }

      default:
        sender.sendMessage(ChatColor.RED + "Unknown subcommand: " + subCommand);
        return false;
    }
  }

  public ApiClient getApiClient() {
    return apiClient;
  }

  public WhitelistManager getWhitelistManager() {
    return whitelistManager;
  }

  public ConfigManager getConfigManager() {
    return configManager;
  }

  public WhitelistCache getWhitelistCache() {
    return whitelistCache;
  }
}
