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
    String commandName = command.getName().toLowerCase();

    if (commandName.equalsIgnoreCase("linkdiscord")) {
      return handleLinkDiscordCommand(sender, args);
    }

    if (!commandName.equalsIgnoreCase("hwl")) {
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

  private boolean handleLinkDiscordCommand(CommandSender sender, String[] args) {
    if (!(sender instanceof Player)) {
      sender.sendMessage(ChatColor.RED + "This command can only be used by players!");
      return true;
    }

    if (!sender.hasPermission("heimdall.linkdiscord")) {
      sender.sendMessage(ChatColor.RED + "You don't have permission to use this command!");
      return true;
    }

    Player player = (Player) sender;
    String username = player.getName().toLowerCase();
    String uuid = player.getUniqueId().toString();

    // Check if plugin is enabled
    if (!getConfig().getBoolean("enabled", false)) {
      sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
          "§cWhitelist system is currently disabled. Please contact an administrator."));
      return true;
    }

    // Rate limiting check - simple cooldown per player
    long currentTime = System.currentTimeMillis();
    String cooldownKey = "linkdiscord_cooldown_" + uuid;
    long lastUsed = getConfig().getLong("cooldowns." + cooldownKey, 0);
    long cooldownTime = 30000; // 30 seconds cooldown

    // Allow bypass for staff
    if (!player.hasPermission("heimdall.bypass") && (currentTime - lastUsed) < cooldownTime) {
      long remainingSeconds = (cooldownTime - (currentTime - lastUsed)) / 1000;
      sender.sendMessage(ChatColor.translateAlternateColorCodes('&',
          "§cPlease wait " + remainingSeconds + " seconds before using this command again."));
      return true;
    }

    // Set cooldown
    getConfig().set("cooldowns." + cooldownKey, currentTime);

    // Show loading message
    sender.sendMessage(ChatColor.translateAlternateColorCodes('&', "§eRequesting Discord link code..."));

    // Make API call asynchronously
    getServer().getScheduler().runTaskAsynchronously(this, () -> {
      try {
        String authCode = whitelistManager.requestLinkCode(username, uuid);

        // Display result on main thread
        getServer().getScheduler().runTask(this, () -> {
          StringBuilder borderBuilder = new StringBuilder();
          for (int i = 0; i < 50; i++) {
            borderBuilder.append("=");
          }
          String border = ChatColor.GREEN + borderBuilder.toString();
          player.sendMessage(border);
          player.sendMessage(ChatColor.translateAlternateColorCodes('&',
              "§eYour Discord Link Code: §a§l" + authCode));
          player.sendMessage(ChatColor.translateAlternateColorCodes('&',
              "§7Go to Discord and use: §f/confirm-code " + authCode));
          player.sendMessage(ChatColor.translateAlternateColorCodes('&',
              "§7This code expires in 5 minutes"));
          player.sendMessage(border);
        });
      } catch (Exception e) {
        // Handle errors on main thread
        getServer().getScheduler().runTask(this, () -> {
          String errorMessage = e.getMessage();
          if (errorMessage != null && errorMessage.contains("No linkable account")) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                "§cYou don't have a linkable account. You may already be linked to Discord, or you're not whitelisted on this server."));
          } else if (errorMessage != null && errorMessage.contains("API")) {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                "§cFailed to generate link code (Error: " + errorMessage
                    + "). Please try again in a moment or contact staff if this persists."));
          } else {
            player.sendMessage(ChatColor.translateAlternateColorCodes('&',
                "§cFailed to generate link code. Please try again or contact staff if this persists."));
          }
          getLogger().warning("Link code generation failed for " + username + ": " + e.getMessage());
        });
      }
    });

    return true;
  }
}
