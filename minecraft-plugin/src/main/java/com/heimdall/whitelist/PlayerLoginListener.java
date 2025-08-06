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
        if (!isPlayerWhitelisted(username)) {
          plugin.getServer().getScheduler().runTask(plugin, () -> {
            addToWhitelist(username);
            plugin.getLogger().info("Added " + username + " to local whitelist per API decision");
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
        if (isPlayerWhitelisted(username)) {
          plugin.getServer().getScheduler().runTask(plugin, () -> {
            removeFromWhitelist(username);
            plugin.getLogger().info("Removed " + username + " from local whitelist per API decision");
          });
        }

        // Deny connection with appropriate message
        event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
            ChatColor.translateAlternateColorCodes('&', response.getKickMessage()));
      }

    } catch (Exception e) {
      plugin.getLogger().log(Level.SEVERE, "Failed to check whitelist for " + username, e);

      // On API failure, fall back to local whitelist
      if (isPlayerWhitelisted(username)) {
        plugin.getLogger().warning("API failed for " + username + ", allowing based on local whitelist");
        event.allow();
      } else {
        // Use fallback error message
        String errorMessage = plugin.getConfig().getString("messages.apiError",
            "§cWhitelist system is temporarily unavailable. Please try again later.");
        event.disallow(AsyncPlayerPreLoginEvent.Result.KICK_WHITELIST,
            ChatColor.translateAlternateColorCodes('&', errorMessage));
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

  private boolean isPlayerWhitelisted(String username) {
    return plugin.getServer().getWhitelistedPlayers().stream()
        .anyMatch(profile -> profile.getName() != null && profile.getName().equalsIgnoreCase(username));
  }

  private void addToWhitelist(String username) {
    // Find player by name and add to whitelist
    plugin.getServer().getWhitelistedPlayers().add(
        plugin.getServer().getOfflinePlayer(username));
  }

  private void removeFromWhitelist(String username) {
    // Remove player from whitelist by name
    plugin.getServer().getWhitelistedPlayers()
        .removeIf(profile -> profile.getName() != null && profile.getName().equalsIgnoreCase(username));
  }
}
