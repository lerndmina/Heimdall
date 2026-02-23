package com.heimdall.whitelist.paper;

import com.heimdall.whitelist.core.*;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.Listener;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.UUID;

/**
 * Main Paper/Bukkit plugin class for Heimdall Whitelist
 */
public class HeimdallPaperPlugin extends JavaPlugin implements Listener {

  private PluginLogger logger;
  private ConfigProvider configProvider;
  private ApiClient apiClient;
  private WhitelistManager whitelistManager;
  private WhitelistCache whitelistCache;
  private PaperLuckPermsManager luckPermsManager;
  private int cacheCleanupTaskId = -1;

  @Override
  public void onEnable() {
    // Save default config if it doesn't exist
    saveDefaultConfig();

    // Initialize adapters
    logger = new PaperLogger(this);
    configProvider = new PaperConfigProvider(this);

    // Initialize core managers
    apiClient = new ApiClient(logger, configProvider);
    whitelistManager = new WhitelistManager(logger, configProvider, apiClient);

    // Initialize LuckPerms integration only if LuckPerms is available
    if (getServer().getPluginManager().getPlugin("LuckPerms") != null) {
      try {
        luckPermsManager = new PaperLuckPermsManager(this, logger);
      } catch (NoClassDefFoundError e) {
        logger.warning("LuckPerms plugin found but API classes not available. Role sync disabled.");
        luckPermsManager = null;
      }
    } else {
      logger.info("LuckPerms not detected. Role sync features will be disabled.");
      luckPermsManager = null;
    }

    // Initialize whitelist cache
    long cacheWindow = getConfig().getLong("cache.cacheWindow", 60);
    long extendOnJoin = getConfig().getLong("cache.extendOnJoin", 120);
    long extendOnLeave = getConfig().getLong("cache.extendOnLeave", 180);
    whitelistCache = new WhitelistCache(logger, getDataFolder(), cacheWindow, extendOnJoin, extendOnLeave);

    // Register events
    getServer().getPluginManager().registerEvents(new PaperLoginListener(this), this);
    getServer().getPluginManager().registerEvents(new PaperJoinLeaveListener(this), this);

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
      logger.info("Generated new server ID: " + serverId);
    }

    logger.info("Heimdall Whitelist Plugin (Paper) enabled successfully!");
    logger.info("API URL: " + getConfig().getString("api.baseUrl"));
    logger.info("Server ID: " + getConfig().getString("server.serverId"));

    // Check if plugin is enabled and warn accordingly
    boolean enabled = getConfig().getBoolean("enabled", false);
    if (enabled) {
      logger.info("Whitelist protection is ACTIVE - all players will be checked");
    } else {
      logger.warning("================================================");
      logger.warning("WHITELIST PROTECTION IS DISABLED!");
      logger.warning("All players can join without Discord verification!");
      logger.warning("Enable in config.yml or use '/hwl enable' command");
      logger.warning("================================================");
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

    logger.info("Heimdall Whitelist Plugin disabled!");
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
      sender.sendMessage(colorize("&cYou don't have permission to use this command!"));
      return true;
    }

    if (args.length == 0) {
      sender.sendMessage(colorize("&eHeimdall Whitelist Commands:"));
      sender.sendMessage(colorize("&7/hwl reload - Reload configuration"));
      sender.sendMessage(colorize("&7/hwl status - Show plugin status"));
      sender.sendMessage(colorize("&7/hwl enable - Enable the whitelist plugin"));
      sender.sendMessage(colorize("&7/hwl disable - Disable the whitelist plugin"));
      sender.sendMessage(colorize("&7/hwl test <player> - Test whitelist check for player"));
      sender.sendMessage(colorize("&7/hwl cache stats - Show cache statistics"));
      sender.sendMessage(colorize("&7/hwl cache clear - Clear the whitelist cache"));
      sender.sendMessage(colorize("&7/hwl cache cleanup - Clean up expired cache entries"));
      return true;
    }

    String subCommand = args[0].toLowerCase();

    switch (subCommand) {
      case "reload":
        reloadConfig();
        apiClient.updateConfig();
        sender.sendMessage(colorize(getConfig().getString("messages.reloaded", "&aPlugin reloaded!")));
        return true;

      case "status":
        boolean enabled = getConfig().getBoolean("enabled", false);
        String enabledStatus = enabled ? "&aENABLED" : "&cDISABLED";

        String statusMsg = getConfig().getString("messages.status", "Status: OK")
            .replace("{url}", getConfig().getString("api.baseUrl", "Not set"))
            .replace("{serverId}", getConfig().getString("server.serverId", "Not set"))
            .replace("{lastCheck}", whitelistManager.getLastCheckTime());

        sender.sendMessage(colorize(statusMsg));
        sender.sendMessage(colorize("&7Plugin Status: " + enabledStatus));

        if (!enabled) {
          sender.sendMessage(
              colorize("&eWarning: Plugin is disabled. All players can join without whitelist checks!"));
          sender.sendMessage(colorize("&7Enable in config.yml by setting 'enabled: true'"));
        }
        return true;

      case "enable":
        getConfig().set("enabled", true);
        saveConfig();
        sender.sendMessage(colorize("&aHeimdall Whitelist plugin enabled!"));
        sender.sendMessage(colorize("&eWhitelist checks are now active for all players."));
        return true;

      case "disable":
        getConfig().set("enabled", false);
        saveConfig();
        sender.sendMessage(colorize("&cHeimdall Whitelist plugin disabled!"));
        sender.sendMessage(colorize("&eWarning: All players can now join without whitelist checks!"));
        return true;

      case "test":
        if (args.length < 2) {
          sender.sendMessage(colorize("&cUsage: /hwl test <username>"));
          return true;
        }

        String testPlayer = args[1];
        sender.sendMessage(colorize("&eTesting whitelist check for " + testPlayer + "..."));

        // Perform async test
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
          try {
            WhitelistResponse response = whitelistManager.checkPlayerWhitelist(
                testPlayer,
                null, // UUID unknown for test
                sender instanceof Player
                    ? ((Player) sender).getAddress().getAddress().getHostAddress()
                    : "127.0.0.1");

            getServer().getScheduler().runTask(this, () -> {
              sender.sendMessage(colorize("&aTest Results for " + testPlayer + ":"));
              sender.sendMessage(colorize(
                  "&7Should be whitelisted: " + (response.shouldBeWhitelisted() ? "YES" : "NO")));
              sender.sendMessage(colorize("&7Has auth: " + (response.hasAuth() ? "YES" : "NO")));
              sender.sendMessage(colorize("&7Action: " + response.getAction()));
              sender.sendMessage(colorize("&7Message: " + response.getKickMessage()));
            });
          } catch (Exception e) {
            getServer().getScheduler().runTask(this, () -> {
              sender.sendMessage(colorize("&cTest failed: " + e.getMessage()));
            });
          }
        });
        return true;

      case "cache":
        if (args.length < 2) {
          sender.sendMessage(colorize("&cUsage: /hwl cache <stats|clear|cleanup>"));
          return true;
        }

        String cacheSubCommand = args[1].toLowerCase();
        switch (cacheSubCommand) {
          case "stats":
            sender.sendMessage(colorize("&eWhitelist Cache Statistics:"));
            sender.sendMessage(colorize("&7" + whitelistCache.getCacheStats()));
            return true;

          case "clear":
            // Clear the cache
            whitelistCache.clear();
            whitelistManager.clearCache();
            sender.sendMessage(colorize("&aWhitelist cache cleared successfully!"));
            return true;

          case "cleanup":
            whitelistCache.cleanupExpiredEntries();
            sender.sendMessage(colorize("&aExpired cache entries cleaned up!"));
            return true;

          default:
            sender.sendMessage(colorize("&cUnknown cache subcommand: " + cacheSubCommand));
            sender.sendMessage(colorize("&7Available: stats, clear, cleanup"));
            return true;
        }

      default:
        sender.sendMessage(colorize("&cUnknown subcommand: " + subCommand));
        return false;
    }
  }

  private boolean handleLinkDiscordCommand(CommandSender sender, String[] args) {
    if (!(sender instanceof Player)) {
      sender.sendMessage(colorize("&cThis command can only be used by players!"));
      return true;
    }

    if (!sender.hasPermission("heimdall.linkdiscord")) {
      sender.sendMessage(colorize("&cYou don't have permission to use this command!"));
      return true;
    }

    Player player = (Player) sender;
    String username = player.getName().toLowerCase();
    String uuid = player.getUniqueId().toString();

    // Check if plugin is enabled
    if (!getConfig().getBoolean("enabled", false)) {
      sender.sendMessage(colorize("&cWhitelist system is currently disabled. Please contact an administrator."));
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
      sender.sendMessage(
          colorize("&cPlease wait " + remainingSeconds + " seconds before using this command again."));
      return true;
    }

    // Set cooldown
    getConfig().set("cooldowns." + cooldownKey, currentTime);

    // Show loading message
    sender.sendMessage(colorize("&eRequesting Discord link code..."));

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
          String border = "&a" + borderBuilder.toString();
          player.sendMessage(colorize(border));
          player.sendMessage(colorize("&eYour Discord Link Code: &a&l" + authCode));
          player.sendMessage(colorize("&7Go to Discord and use: &f/confirm-code " + authCode));
          player.sendMessage(colorize("&7This code expires in 5 minutes"));
          player.sendMessage(colorize(border));
        });
      } catch (Exception e) {
        // Handle errors on main thread
        getServer().getScheduler().runTask(this, () -> {
          String errorMessage = e.getMessage();
          if (errorMessage != null && errorMessage.toLowerCase().contains("already linked")) {
            player.sendMessage(colorize("&eThis Minecraft account is already linked."));
            String info = extractUserFacingLinkError(errorMessage);
            if (info != null && !info.isBlank()) {
              player.sendMessage(colorize("&7" + info));
            }
          } else if (errorMessage != null && errorMessage.contains("No linkable account")) {
            player.sendMessage(colorize(
                "&cYou don't have a linkable account. You may already be linked to Discord, or you're not whitelisted on this server."));
          } else if (errorMessage != null && errorMessage.contains("API")) {
            player.sendMessage(colorize(
                "&cFailed to generate link code. Please try again in a moment or contact staff if this persists."));
          } else {
            player.sendMessage(colorize(
                "&cFailed to generate link code. Please try again or contact staff if this persists."));
          }
          logger.warning("Link code generation failed for " + username + ": " + e.getMessage());
        });
      }
    });

    return true;
  }

  private String extractUserFacingLinkError(String rawMessage) {
    if (rawMessage == null || rawMessage.isBlank()) {
      return null;
    }

    int lastRuntimeIdx = rawMessage.lastIndexOf("RuntimeException:");
    String cleaned = lastRuntimeIdx >= 0 ? rawMessage.substring(lastRuntimeIdx + "RuntimeException:".length())
        : rawMessage;

    cleaned = cleaned
        .replace("java.util.concurrent.ExecutionException:", "")
        .replace("java.lang.RuntimeException:", "")
        .replace("API request failed:", "")
        .trim();

    return cleaned.isBlank() ? null : cleaned;
  }

  /**
   * Convert legacy color codes to Component
   */
  public Component colorize(String message) {
    return LegacyComponentSerializer.legacyAmpersand().deserialize(message);
  }

  /**
   * Convert legacy section color codes to Component
   */
  public Component colorizeSection(String message) {
    return LegacyComponentSerializer.legacySection().deserialize(message);
  }

  public PluginLogger getPluginLogger() {
    return logger;
  }

  public ConfigProvider getConfigProvider() {
    return configProvider;
  }

  public ApiClient getApiClient() {
    return apiClient;
  }

  public WhitelistManager getWhitelistManager() {
    return whitelistManager;
  }

  public WhitelistCache getWhitelistCache() {
    return whitelistCache;
  }

  public PaperLuckPermsManager getLuckPermsManager() {
    return luckPermsManager;
  }
}
