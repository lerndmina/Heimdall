package com.heimdall.whitelist;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.PlayerLoginEvent;
import org.bukkit.ChatColor;

import java.util.logging.Level;

public class PlayerLoginListener implements Listener {

  private final HeimdallWhitelistPlugin plugin;

  public PlayerLoginListener(HeimdallWhitelistPlugin plugin) {
    this.plugin = plugin;
  }

  @EventHandler(priority = EventPriority.LOW)
  public void onPlayerPreLogin(AsyncPlayerPreLoginEvent event) {
    // Skip if the event is already cancelled (e.g., by ban plugins like LiteBans)
    if (event.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) {
      if (plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger().info("Skipping whitelist check for " + event.getName() +
            " - already denied by another plugin: " + event.getLoginResult());
      }
      return;
    }

    // Check if the plugin is globally enabled
    if (!plugin.getConfig().getBoolean("enabled", false)) {
      if (plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger().info("Plugin is disabled, allowing " + event.getName() + " without whitelist check");
      }
      // Don't call event.allow() - just let other plugins handle it
      return;
    }

    // Skip if player has bypass permission (this check works in async)
    // Note: We can't check permissions in AsyncPlayerPreLoginEvent reliably
    // So we'll handle bypass in the sync PlayerLoginEvent

    String username = event.getName();
    String uuid = event.getUniqueId().toString();
    String ip = event.getAddress().getHostAddress();

    if (plugin.getConfig().getBoolean("logging.debug", false)) {
      plugin.getLogger().info("Checking whitelist for " + username + " (" + uuid + ") from " + ip);
    }

    // First check cache (only for positive results)
    Boolean cachedResult = plugin.getWhitelistCache().isCachedWhitelisted(uuid, username);
    if (cachedResult != null && cachedResult) {
      if (plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger().info("Cache hit for " + username + ": allowing based on cache");
      }
      // Player is cached as whitelisted - let the event proceed naturally
      return;
    }

    // Cache miss or no positive cache - check with API
    if (plugin.getConfig().getBoolean("logging.debug", false)) {
      if (cachedResult == null) {
        plugin.getLogger().info("No cache entry for " + username + ", checking API");
      } else {
        plugin.getLogger().info("Not in positive cache for " + username + ", checking API");
      }
    }

    try {
      // Check whitelist with API
      WhitelistResponse response = plugin.getWhitelistManager().checkPlayerWhitelist(username, uuid, ip);

      if (plugin.getConfig().getBoolean("logging.logDecisions", true)) {
        plugin.getLogger().info("Whitelist decision for " + username + ": " + response.toString());
      }

      if (response.shouldBeWhitelisted()) {
        // Only cache positive results so newly whitelisted players can join immediately
        plugin.getWhitelistCache().addWhitelistedPlayer(uuid, username);

        // If the action is to show an auth code, we need to kick with the code
        if ("show_auth_code".equals(response.getAction())) {
          event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
              ChatColor.translateAlternateColorCodes('&', response.getKickMessage()));
        }
        // If player should be whitelisted and no auth code needed, do nothing - let
        // event proceed naturally
        // This ensures other plugins (like LiteBans) can still deny the connection if
        // needed
      } else {
        // DON'T cache negative results - we want newly whitelisted players to be able
        // to join immediately
        // Just deny the connection
        event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
            ChatColor.translateAlternateColorCodes('&', response.getKickMessage()));
      }

    } catch (Exception e) {
      plugin.getLogger().log(Level.SEVERE, "Failed to check whitelist for " + username, e);

      // Handle API failure based on configured fallback mode
      String fallbackMode = plugin.getConfig().getString("advanced.apiFallbackMode", "deny");

      switch (fallbackMode.toLowerCase()) {
        case "allow":
          plugin.getLogger().warning("API failed for " + username + ", allowing connection (fail-open mode)");
          // Don't call event.allow() - just let the event proceed naturally
          // This allows other plugins like LiteBans to still deny if needed

          // Schedule a task to send a message to the player after they join
          plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            Player player = plugin.getServer().getPlayer(username);
            if (player != null && player.isOnline()) {
              String message = plugin.getConfig().getString("messages.apiUnavailableAllowed",
                  "§eAPI temporarily unavailable - access granted.\n§7Please link your Discord account when possible.");
              player.sendMessage(ChatColor.translateAlternateColorCodes('&', message));
            }
          }, 20L); // Delay 1 second (20 ticks) to ensure player is fully connected
          break;

        case "whitelist-only":
          // Fall back to cache - only allow if player has a positive cache entry
          Boolean cachedWhitelisted = plugin.getWhitelistCache().isCachedWhitelisted(uuid, username);
          if (cachedWhitelisted != null && cachedWhitelisted) {
            plugin.getLogger()
                .warning("API failed for " + username + " (" + uuid + "), allowing based on positive cache");
            // Don't call event.allow() - just let the event proceed naturally
          } else {
            plugin.getLogger().warning("API failed for " + username + ", denying (no positive cache entry)");
            String errorMessage = plugin.getConfig().getString("messages.apiUnavailable",
                "§cWhitelist system is temporarily unavailable. Please try again later.");
            event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
                ChatColor.translateAlternateColorCodes('&', errorMessage));
          }
          break;

        case "deny":
        default:
          // Deny all connections when API is down
          plugin.getLogger().warning("API failed for " + username + ", denying connection (fail-closed mode)");
          String errorMessage = plugin.getConfig().getString("messages.apiUnavailable",
              "§cWhitelist system is temporarily unavailable. Please try again later.");
          event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
              ChatColor.translateAlternateColorCodes('&', errorMessage));
          break;
      }
    }
  }

  @EventHandler(priority = EventPriority.HIGH)
  public void onPlayerLogin(PlayerLoginEvent event) {
    Player player = event.getPlayer();

    // Check for bypass permission
    if (player.hasPermission("heimdall.bypass")) {
      if (plugin.getConfig().getBoolean("logging.debug", false)) {
        plugin.getLogger()
            .info("Player " + player.getName() + " bypassed whitelist check (has heimdall.bypass permission)");
      }
      event.allow();
      return;
    }

    // The actual whitelist check was done in AsyncPlayerPreLoginEvent
    // This is just for bypass permission check and any final validations
  }
}
