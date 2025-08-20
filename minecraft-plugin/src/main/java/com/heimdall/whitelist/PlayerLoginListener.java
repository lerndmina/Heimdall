package com.heimdall.whitelist;

import org.bukkit.OfflinePlayer;
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

  @EventHandler(priority = EventPriority.HIGHEST)
  public void onPlayerPreLogin(AsyncPlayerPreLoginEvent event) {
    // Skip if player has bypass permission (this check works in async)
    // Note: We can't check permissions in AsyncPlayerPreLoginEvent reliably
    // So we'll handle bypass in the sync PlayerLoginEvent

    String username = event.getName();
    String uuid = event.getUniqueId().toString();
    String ip = event.getAddress().getHostAddress();

    if (plugin.getConfig().getBoolean("logging.debug", false)) {
      plugin.getLogger().info("Checking whitelist for " + username + " (" + uuid + ") from " + ip);
    }

    try {
      // Check whitelist with API
      WhitelistResponse response = plugin.getWhitelistManager().checkPlayerWhitelist(username, uuid, ip);

      if (plugin.getConfig().getBoolean("logging.logDecisions", true)) {
        plugin.getLogger().info("Whitelist decision for " + username + ": " + response.toString());
      }

      if (response.shouldBeWhitelisted()) {
        // Player should be whitelisted - ensure they're on the local whitelist
        if (!isPlayerWhitelisted(username, uuid)) {
          plugin.getServer().getScheduler().runTask(plugin, () -> {
            addToWhitelist(username, uuid);
            plugin.getLogger().info("Added " + username + " (" + uuid + ") to local whitelist per API decision");
          });
        }

        // If the action is to show an auth code, we need to kick with the code
        if ("show_auth_code".equals(response.getAction())) {
          event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
              ChatColor.translateAlternateColorCodes('&', response.getKickMessage()));
        } else {
          // Allow connection
          event.allow();
        }
      } else {
        // Player should not be whitelisted - remove from local whitelist if present
        if (isPlayerWhitelisted(username, uuid)) {
          plugin.getServer().getScheduler().runTask(plugin, () -> {
            removeFromWhitelist(username, uuid);
            plugin.getLogger().info("Removed " + username + " (" + uuid + ") from local whitelist per API decision");
          });
        }

        // Deny connection with appropriate message
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
          event.allow();

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
          // Fall back to local whitelist
          if (isPlayerWhitelisted(username, uuid)) {
            plugin.getLogger()
                .warning("API failed for " + username + " (" + uuid + "), allowing based on local whitelist");
            event.allow();
          } else {
            plugin.getLogger().warning("API failed for " + username + ", denying (not on local whitelist)");
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

  private boolean isPlayerWhitelisted(String username, String uuid) {
    return plugin.getServer().getWhitelistedPlayers().stream()
        .anyMatch(profile -> {
          // Check by UUID first (more reliable), then fallback to username
          if (uuid != null && profile.getUniqueId() != null) {
            return profile.getUniqueId().toString().equalsIgnoreCase(uuid);
          }
          return profile.getName() != null && profile.getName().equalsIgnoreCase(username);
        });
  }

  private void addToWhitelist(String username, String uuid) {
    // Prefer UUID-based operations if available
    if (uuid != null) {
      try {
        plugin.getServer().getWhitelistedPlayers().add(
            plugin.getServer().getOfflinePlayer(java.util.UUID.fromString(uuid)));
      } catch (IllegalArgumentException e) {
        // Fallback to username if UUID is invalid
        plugin.getLogger().warning("Invalid UUID format: " + uuid + ", falling back to username");
        @SuppressWarnings("deprecation")
        OfflinePlayer offlinePlayer = plugin.getServer().getOfflinePlayer(username);
        plugin.getServer().getWhitelistedPlayers().add(offlinePlayer);
      }
    } else {
      // Fallback to username-based operation
      @SuppressWarnings("deprecation")
      OfflinePlayer offlinePlayer = plugin.getServer().getOfflinePlayer(username);
      plugin.getServer().getWhitelistedPlayers().add(offlinePlayer);
    }
  }

  private void removeFromWhitelist(String username, String uuid) {
    // Remove by UUID first if available, then by username
    plugin.getServer().getWhitelistedPlayers().removeIf(profile -> {
      if (uuid != null && profile.getUniqueId() != null) {
        return profile.getUniqueId().toString().equalsIgnoreCase(uuid);
      }
      return profile.getName() != null && profile.getName().equalsIgnoreCase(username);
    });
  }
}
