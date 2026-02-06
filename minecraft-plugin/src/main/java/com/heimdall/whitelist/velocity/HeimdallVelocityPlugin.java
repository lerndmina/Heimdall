package com.heimdall.whitelist.velocity;

import com.google.inject.Inject;
import com.heimdall.whitelist.core.*;
import com.velocitypowered.api.command.CommandSource;
import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.event.PostOrder;
import com.velocitypowered.api.event.ResultedEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.LoginEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.slf4j.Logger;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Main Velocity plugin class for Heimdall Whitelist
 */
@Plugin(id = "heimdall-whitelist", name = "HeimdallWhitelist", version = "2.0.0", description = "Dynamic whitelist integration with Heimdall Discord bot", url = "https://github.com/lerndmina/Heimdall", authors = {
    "Lerndmina" })
public class HeimdallVelocityPlugin {

  private final ProxyServer server;
  private final Logger slf4jLogger;
  private final Path dataDirectory;

  private VelocityLogger logger;
  private VelocityConfigProvider configProvider;
  private ApiClient apiClient;
  private WhitelistManager whitelistManager;
  private WhitelistCache whitelistCache;
  private VelocityLuckPermsManager luckPermsManager;

  @Inject
  public HeimdallVelocityPlugin(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
    this.server = server;
    this.slf4jLogger = logger;
    this.dataDirectory = dataDirectory;
  }

  @Subscribe
  public void onProxyInitialization(ProxyInitializeEvent event) {
    // Initialize adapters
    configProvider = new VelocityConfigProvider(dataDirectory);
    logger = new VelocityLogger(slf4jLogger, configProvider.getBoolean("logging.debug", false));

    // Initialize core managers
    apiClient = new ApiClient(logger, configProvider);
    whitelistManager = new WhitelistManager(logger, configProvider, apiClient);

    // Initialize whitelist cache
    long cacheWindow = configProvider.getLong("cache.cacheWindow", 60);
    long extendOnJoin = configProvider.getLong("cache.extendOnJoin", 120);
    long extendOnLeave = configProvider.getLong("cache.extendOnLeave", 180);
    whitelistCache = new WhitelistCache(logger, dataDirectory.toFile(), cacheWindow, extendOnJoin, extendOnLeave);

    // Initialize LuckPerms manager (optional - will log warning if not available)
    luckPermsManager = new VelocityLuckPermsManager(logger);

    // Schedule cache cleanup task
    long cleanupInterval = configProvider.getLong("cache.cleanupInterval", 30);
    server.getScheduler().buildTask(this, () -> {
      whitelistCache.cleanupExpiredEntries();
    }).repeat(cleanupInterval, TimeUnit.MINUTES).schedule();

    // Generate server ID if not set
    if (configProvider.getString("server.serverId", "").isEmpty()) {
      String serverId = UUID.randomUUID().toString();
      configProvider.set("server.serverId", serverId);
      configProvider.save();
      logger.info("Generated new server ID: " + serverId);
    }

    // Register command
    server.getCommandManager().register("hwl", new HeimdallCommand(), "heimdallwhitelist");

    logger.info("Heimdall Whitelist Plugin (Velocity) enabled successfully!");
    logger.info("API URL: " + configProvider.getString("api.baseUrl", "Not set"));
    logger.info("Server ID: " + configProvider.getString("server.serverId", "Not set"));

    // Log LuckPerms status
    if (luckPermsManager != null && luckPermsManager.isAvailable()) {
      logger.info("LuckPerms integration: ENABLED - Role sync will work");
    } else {
      logger.warning("LuckPerms integration: DISABLED - Role sync will NOT work");
      logger.warning("Install LuckPerms on Velocity to enable Discord role sync");
    }

    // Check if plugin is enabled and warn accordingly
    boolean enabled = configProvider.getBoolean("enabled", false);
    if (enabled) {
      logger.info("Whitelist protection is ACTIVE - all players will be checked");
    } else {
      logger.warning("================================================");
      logger.warning("WHITELIST PROTECTION IS DISABLED!");
      logger.warning("All players can join without Discord verification!");
      logger.warning("Enable in config.json or use '/hwl enable' command");
      logger.warning("================================================");
    }
  }

  @Subscribe
  public void onProxyShutdown(ProxyShutdownEvent event) {
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

  @Subscribe(order = PostOrder.FIRST)
  public void onLogin(LoginEvent event) {
    // Check if the plugin is globally enabled
    if (!configProvider.getBoolean("enabled", false)) {
      if (configProvider.getBoolean("logging.debug", false)) {
        logger.debug("Plugin is disabled, allowing " + event.getPlayer().getUsername() + " without whitelist check");
      }
      return;
    }

    Player player = event.getPlayer();
    String username = player.getUsername();
    String uuid = player.getUniqueId().toString();
    String ip = player.getRemoteAddress().getAddress().getHostAddress();
    UUID playerUuid = player.getUniqueId();

    if (configProvider.getBoolean("logging.debug", false)) {
      logger.debug("Checking whitelist for " + username + " (" + uuid + ") from " + ip);
    }

    // Get current LuckPerms groups if available
    List<String> currentGroups = null;
    if (luckPermsManager != null && luckPermsManager.isAvailable()) {
      currentGroups = luckPermsManager.getPlayerGroups(playerUuid);
      if (configProvider.getBoolean("logging.debug", false)) {
        logger.debug("Current LuckPerms groups for " + username + ": " + currentGroups);
      }
    }

    // LoginEvent fires after authentication, so we have the UUID
    try {
      WhitelistResponse response = whitelistManager.checkPlayerWhitelist(
          username,
          uuid,
          ip,
          currentGroups,
          configProvider.getString("server.publicIp", "localhost"),
          whitelistCache.isCachedWhitelisted(uuid, username) != null);

      if (configProvider.getBoolean("logging.logDecisions", true)) {
        logger.info("Whitelist decision for " + username + ": " + response.toString());
      }

      if (response.shouldBeWhitelisted()) {
        // Allow connection
        if (configProvider.getBoolean("logging.debug", false)) {
          logger.debug("Allowing " + username + " to connect");
        }

        // Apply role sync if enabled and LuckPerms is available
        if (response.isRoleSyncEnabled() && response.getManagedGroups() != null
            && !response.getManagedGroups().isEmpty()) {

          if (luckPermsManager != null && luckPermsManager.isAvailable()) {
            logger.info("Scheduling role sync for " + username + " with target groups: "
                + response.getTargetGroups() +
                " and managed groups: " + response.getManagedGroups());

            // Schedule role sync after a short delay to ensure player is fully connected
            final List<String> targetGroups = response.getTargetGroups();
            final List<String> managedGroups = response.getManagedGroups();

            server.getScheduler().buildTask(this, () -> {
              try {
                luckPermsManager.setPlayerGroups(playerUuid, targetGroups, managedGroups)
                    .thenAccept(success -> {
                      if (success) {
                        logger.info("Successfully applied role sync for " + username);
                      } else {
                        logger.warning("Role sync returned false for " + username);
                      }
                    });
              } catch (Exception e) {
                logger.warning("Failed to apply role sync for " + username + ": " + e.getMessage());
              }
            }).delay(2, TimeUnit.SECONDS).schedule();
          } else {
            logger.warning("Role sync requested for " + username + " but LuckPerms is not available on Velocity");
          }
        }

        // If the action is to show an auth code, deny with the code message
        if ("show_auth_code".equals(response.getAction())) {
          event.setResult(ResultedEvent.ComponentResult.denied(
              colorize(response.getKickMessage())));
        }
        // Otherwise, let them through (don't modify result)
      } else {
        // Deny connection
        event.setResult(ResultedEvent.ComponentResult.denied(
            colorize(response.getKickMessage())));
      }

    } catch (Exception e) {
      logger.severe("Failed to check whitelist for " + username + ": " + e.getMessage());

      // Handle API failure based on configured fallback mode
      String fallbackMode = configProvider.getString("advanced.apiFallbackMode", "deny");

      switch (fallbackMode.toLowerCase()) {
        case "allow":
          logger.warning("API failed for " + username + ", allowing connection (fail-open mode)");
          // Don't modify event result - allow through
          break;

        case "deny":
        default:
          logger.warning("API failed for " + username + ", denying connection (fail-closed mode)");
          String errorMessage = configProvider.getString("messages.apiUnavailable",
              "§cWhitelist system is temporarily unavailable. Please try again later.");
          event.setResult(ResultedEvent.ComponentResult.denied(colorize(errorMessage)));
          break;
      }
    }
  }

  /**
   * Convert legacy color codes to Component
   */
  private Component colorize(String message) {
    return LegacyComponentSerializer.legacySection().deserialize(message.replace('&', '§'));
  }

  /**
   * Admin command handler
   */
  private class HeimdallCommand implements SimpleCommand {

    @Override
    public void execute(Invocation invocation) {
      CommandSource source = invocation.source();
      String[] args = invocation.arguments();

      if (!source.hasPermission("heimdall.admin")) {
        source.sendMessage(colorize("&cYou don't have permission to use this command!"));
        return;
      }

      if (args.length == 0) {
        source.sendMessage(colorize("&eHeimdall Whitelist Commands (Velocity):"));
        source.sendMessage(colorize("&7/hwl reload - Reload configuration"));
        source.sendMessage(colorize("&7/hwl status - Show plugin status"));
        source.sendMessage(colorize("&7/hwl enable - Enable the whitelist plugin"));
        source.sendMessage(colorize("&7/hwl disable - Disable the whitelist plugin"));
        source.sendMessage(colorize("&7/hwl test <player> - Test whitelist check for player"));
        source.sendMessage(colorize("&7/hwl cache stats - Show cache statistics"));
        source.sendMessage(colorize("&7/hwl cache clear - Clear the whitelist cache"));
        return;
      }

      String subCommand = args[0].toLowerCase();

      switch (subCommand) {
        case "reload":
          configProvider.reload();
          apiClient.updateConfig();
          logger.setDebugEnabled(configProvider.getBoolean("logging.debug", false));
          source.sendMessage(
              colorize(configProvider.getString("messages.reloaded", "&aPlugin reloaded!")));
          break;

        case "status":
          boolean enabled = configProvider.getBoolean("enabled", false);
          String enabledStatus = enabled ? "&aENABLED" : "&cDISABLED";
          String luckPermsStatus = (luckPermsManager != null && luckPermsManager.isAvailable())
              ? "&aAVAILABLE"
              : "&cNOT AVAILABLE";

          String statusMsg = configProvider.getString("messages.status", "Status: OK")
              .replace("{url}", configProvider.getString("api.baseUrl", "Not set"))
              .replace("{serverId}", configProvider.getString("server.serverId", "Not set"))
              .replace("{lastCheck}", whitelistManager.getLastCheckTime());

          source.sendMessage(colorize(statusMsg));
          source.sendMessage(colorize("&7Plugin Status: " + enabledStatus));
          source.sendMessage(colorize("&7Platform: Velocity Proxy"));
          source.sendMessage(colorize("&7LuckPerms: " + luckPermsStatus));

          if (!enabled) {
            source.sendMessage(colorize(
                "&eWarning: Plugin is disabled. All players can join without whitelist checks!"));
            source.sendMessage(colorize("&7Enable with '/hwl enable'"));
          }

          if (luckPermsManager == null || !luckPermsManager.isAvailable()) {
            source.sendMessage(colorize("&eWarning: LuckPerms not available. Role sync will not work."));
          }
          break;

        case "enable":
          configProvider.set("enabled", true);
          configProvider.save();
          source.sendMessage(colorize("&aHeimdall Whitelist plugin enabled!"));
          source.sendMessage(colorize("&eWhitelist checks are now active for all players."));
          break;

        case "disable":
          configProvider.set("enabled", false);
          configProvider.save();
          source.sendMessage(colorize("&cHeimdall Whitelist plugin disabled!"));
          source.sendMessage(colorize("&eWarning: All players can now join without whitelist checks!"));
          break;

        case "test":
          if (args.length < 2) {
            source.sendMessage(colorize("&cUsage: /hwl test <username>"));
            return;
          }

          String testPlayer = args[1];
          source.sendMessage(colorize("&eTesting whitelist check for " + testPlayer + "..."));

          // Perform async test
          CompletableFuture.runAsync(() -> {
            try {
              WhitelistResponse response = whitelistManager.checkPlayerWhitelist(
                  testPlayer,
                  null,
                  "127.0.0.1");

              server.getScheduler().buildTask(HeimdallVelocityPlugin.this, () -> {
                source.sendMessage(colorize("&aTest Results for " + testPlayer + ":"));
                source.sendMessage(colorize("&7Should be whitelisted: "
                    + (response.shouldBeWhitelisted() ? "YES" : "NO")));
                source.sendMessage(colorize("&7Has auth: " + (response.hasAuth() ? "YES" : "NO")));
                source.sendMessage(colorize("&7Action: " + response.getAction()));
                source.sendMessage(colorize("&7Message: " + response.getKickMessage()));
              }).schedule();
            } catch (Exception e) {
              server.getScheduler().buildTask(HeimdallVelocityPlugin.this, () -> {
                source.sendMessage(colorize("&cTest failed: " + e.getMessage()));
              }).schedule();
            }
          });
          break;

        case "cache":
          if (args.length < 2) {
            source.sendMessage(colorize("&cUsage: /hwl cache <stats|clear>"));
            return;
          }

          String cacheSubCommand = args[1].toLowerCase();
          switch (cacheSubCommand) {
            case "stats":
              source.sendMessage(colorize("&eWhitelist Cache Statistics:"));
              source.sendMessage(colorize("&7" + whitelistCache.getCacheStats()));
              break;

            case "clear":
              whitelistCache.clear();
              whitelistManager.clearCache();
              source.sendMessage(colorize("&aWhitelist cache cleared successfully!"));
              break;

            default:
              source.sendMessage(colorize("&cUnknown cache subcommand: " + cacheSubCommand));
              source.sendMessage(colorize("&7Available: stats, clear"));
              break;
          }
          break;

        default:
          source.sendMessage(colorize("&cUnknown subcommand: " + subCommand));
          break;
      }
    }

    @Override
    public List<String> suggest(Invocation invocation) {
      String[] args = invocation.arguments();
      if (args.length <= 1) {
        return Arrays.asList("reload", "status", "enable", "disable", "test", "cache");
      } else if (args.length == 2 && args[0].equalsIgnoreCase("cache")) {
        return Arrays.asList("stats", "clear");
      }
      return Arrays.asList();
    }

    @Override
    public boolean hasPermission(Invocation invocation) {
      return invocation.source().hasPermission("heimdall.admin");
    }
  }

  // Getters for other classes if needed
  public VelocityLogger getLogger() {
    return logger;
  }

  public VelocityConfigProvider getConfigProvider() {
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

  public VelocityLuckPermsManager getLuckPermsManager() {
    return luckPermsManager;
  }

  public ProxyServer getServer() {
    return server;
  }
}
